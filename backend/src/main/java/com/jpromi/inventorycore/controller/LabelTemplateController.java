package com.jpromi.inventorycore.controller;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.jpromi.inventorycore.dto.LabelSheetDto;
import com.jpromi.inventorycore.dto.LabelTemplateRequest;
import com.jpromi.inventorycore.dto.LabelTemplateResponse;
import com.jpromi.inventorycore.dto.PageResponse;
import com.jpromi.inventorycore.service.Paging;
import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.LabelSheet;
import com.jpromi.inventorycore.entity.LabelTemplate;
import com.jpromi.inventorycore.enums.PermissionAction;
import com.jpromi.inventorycore.enums.PermissionResourceType;
import com.jpromi.inventorycore.repository.AreaRepository;
import com.jpromi.inventorycore.repository.LabelSettingsRepository;
import com.jpromi.inventorycore.repository.LabelTemplateRepository;
import com.jpromi.inventorycore.service.AccessContext;
import com.jpromi.inventorycore.enums.AuditAction;
import com.jpromi.inventorycore.enums.AuditObjectType;
import com.jpromi.inventorycore.service.AuditService;
import com.jpromi.inventorycore.service.PermissionService;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static com.jpromi.inventorycore.service.PermissionService.require;

/**
 * Label templates belong to an area and are maintained by whoever may maintain the
 * configuration (types) in that area. Templates of the default area are visible to
 * everyone, so there is always a fallback for printing.
 */
@RestController
@RequestMapping("/api/label-templates")
public class LabelTemplateController {

    private static final PermissionResourceType CONFIG = PermissionResourceType.ASSET_TYPE;
    private static final JsonMapper JSON = JsonMapper.builder().build();
    /** Rounding of the editor (0.01 mm) must not count as leaving the safe area. */
    private static final double TOLERANCE_MM = 0.01;

    private final LabelTemplateRepository templateRepository;
    private final AreaRepository areaRepository;
    private final LabelSettingsRepository settingsRepository;
    private final PermissionService permissionService;

    private final AuditService audit;

    public LabelTemplateController(
        LabelTemplateRepository templateRepository,
        AreaRepository areaRepository,
        LabelSettingsRepository settingsRepository,
        PermissionService permissionService,
        AuditService audit
    ) {
        this.templateRepository = templateRepository;
        this.areaRepository = areaRepository;
        this.settingsRepository = settingsRepository;
        this.permissionService = permissionService;
        this.audit = audit;
    }

    @GetMapping
    public List<LabelTemplateResponse> templates(Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        return templateRepository.findAll().stream()
            .filter(template -> isVisible(access, template))
            .sorted(Comparator.comparing(LabelTemplate::getName, String.CASE_INSENSITIVE_ORDER))
            .map(this::toResponse)
            .toList();
    }

    /** Searched and paged, grouped by area (default area first) and then by name. */
    @GetMapping("/page")
    public PageResponse<LabelTemplateResponse> page(
        @RequestParam(required = false) String q,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "" + Paging.DEFAULT_SIZE) int size,
        Authentication authentication
    ) {
        AccessContext access = permissionService.context(authentication);
        List<String> terms = Paging.terms(q);
        List<LabelTemplate> matches = templateRepository.findAll().stream()
            .filter(template -> isVisible(access, template))
            .filter(template -> Paging.matches(terms, template.getName(), template.getDescription(), template.getArea().getName()))
            .sorted(Comparator.comparing((LabelTemplate template) -> !template.getArea().isDefaultArea())
                .thenComparing(template -> template.getArea().getName(), String.CASE_INSENSITIVE_ORDER)
                .thenComparing(LabelTemplate::getName, String.CASE_INSENSITIVE_ORDER))
            .toList();
        return Paging.page(matches, page, size, this::toResponse);
    }

    @GetMapping("/{uuid}")
    public LabelTemplateResponse template(@PathVariable UUID uuid, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        LabelTemplate template = templateOr404(uuid);
        if (!isVisible(access, template)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Label-Vorlage nicht gefunden.");
        }
        return toResponse(template);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public LabelTemplateResponse create(@RequestBody LabelTemplateRequest request, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        Area area = areaOr400(request.areaUuid());
        require(access, CONFIG, PermissionAction.CREATE, Set.of(area));
        LabelTemplate template = LabelTemplate.builder().area(area).build();
        apply(template, request);
        LabelTemplateResponse created = toResponse(templateRepository.save(template));
        audit.log(AuditAction.CREATE, AuditObjectType.LABEL_TEMPLATE, created.uuid(), created.name());
        return created;
    }

    @PatchMapping("/{uuid}")
    @Transactional
    public LabelTemplateResponse update(@PathVariable UUID uuid, @RequestBody LabelTemplateRequest request, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        LabelTemplate template = templateOr404(uuid);
        require(access, CONFIG, PermissionAction.EDIT, Set.of(template.getArea()));
        LabelTemplateResponse before = toResponse(template);
        Area area = areaOr400(request.areaUuid());
        if (!area.getId().equals(template.getArea().getId())) {
            // moving a template needs rights in the target area, too
            require(access, CONFIG, PermissionAction.EDIT, Set.of(area));
            template.setDefaultForArea(false);
            template.setArea(area);
        }
        apply(template, request);
        LabelTemplateResponse after = toResponse(templateRepository.save(template));
        audit.logChanges(AuditObjectType.LABEL_TEMPLATE, after.uuid(), after.name(), before, after);
        return after;
    }

    @DeleteMapping("/{uuid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID uuid, Authentication authentication) {
        AccessContext access = permissionService.context(authentication);
        LabelTemplate template = templateOr404(uuid);
        require(access, CONFIG, PermissionAction.DELETE, Set.of(template.getArea()));
        templateRepository.delete(template);
        audit.log(AuditAction.DELETE, AuditObjectType.LABEL_TEMPLATE, template.getUuid(), template.getName());
    }

    private boolean isVisible(AccessContext access, LabelTemplate template) {
        return template.getArea().isDefaultArea() || access.hasAccessTo(template.getArea());
    }

    private void apply(LabelTemplate template, LabelTemplateRequest request) {
        if (request.name() == null || request.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bitte einen Namen angeben.");
        }
        if (request.widthMm() <= 0 || request.heightMm() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Breite und Höhe des Labels müssen größer als 0 sein.");
        }
        double safeArea = request.safeAreaMm() == null ? settingsRepository.load().getSafeAreaMm() : request.safeAreaMm();
        if (!Double.isFinite(safeArea) || safeArea < 0 || safeArea > LabelSettingsController.MAX_SAFE_AREA_MM
            || 2 * safeArea + 1 > Math.min(request.widthMm(), request.heightMm())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Der Sicherheitsabstand ist für diese Label-Größe zu groß.");
        }
        String elements = request.elementsJson() == null || request.elementsJson().isBlank() ? "[]" : request.elementsJson();
        requireInsideSafeArea(elements, request.widthMm(), request.heightMm(), safeArea);
        LabelSheet sheet = sheet(request.sheet(), request.widthMm(), request.heightMm());
        template.setName(request.name().trim());
        template.setDescription(request.description());
        template.setWidthMm(request.widthMm());
        template.setHeightMm(request.heightMm());
        template.setSafeAreaMm(safeArea);
        template.setElementsJson(elements);
        template.setSheet(sheet);
        if (request.defaultForArea() && !template.isDefaultForArea()) {
            // only one default per area
            templateRepository.findByAreaAndDefaultForAreaTrue(template.getArea()).forEach(previous -> {
                previous.setDefaultForArea(false);
                templateRepository.save(previous);
            });
        }
        template.setDefaultForArea(request.defaultForArea());
    }

    /** Checks that the grid of labels fits on the paper; null stays null (single labels). */
    private static LabelSheet sheet(LabelSheetDto sheet, double labelWidth, double labelHeight) {
        if (sheet == null) {
            return null;
        }
        if (!isLength(sheet.paperWidthMm(), 10, 2000) || !isLength(sheet.paperHeightMm(), 10, 2000)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Das Papierformat muss zwischen 10 und 2000 mm liegen.");
        }
        if (sheet.columns() < 1 || sheet.columns() > 50 || sheet.rows() < 1 || sheet.rows() > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bitte 1 bis 50 Spalten und 1 bis 100 Zeilen angeben.");
        }
        if (!isLength(sheet.marginTopMm(), 0, 1000) || !isLength(sheet.marginLeftMm(), 0, 1000)
            || !isLength(sheet.gapXMm(), 0, 1000) || !isLength(sheet.gapYMm(), 0, 1000)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ränder und Abstände dürfen nicht negativ sein.");
        }
        double right = sheet.marginLeftMm() + sheet.columns() * labelWidth + (sheet.columns() - 1) * sheet.gapXMm();
        double bottom = sheet.marginTopMm() + sheet.rows() * labelHeight + (sheet.rows() - 1) * sheet.gapYMm();
        if (right > sheet.paperWidthMm() + TOLERANCE_MM || bottom > sheet.paperHeightMm() + TOLERANCE_MM) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Die Labels passen mit diesen Rändern und Abständen nicht auf das Papier.");
        }
        return new LabelSheet(sheet.paperWidthMm(), sheet.paperHeightMm(), sheet.columns(), sheet.rows(),
            sheet.marginTopMm(), sheet.marginLeftMm(), sheet.gapXMm(), sheet.gapYMm());
    }

    private static boolean isLength(double value, double min, double max) {
        return Double.isFinite(value) && value >= min && value <= max;
    }

    /** No element may reach into the margin along the edges (the safe area). */
    private static void requireInsideSafeArea(String elementsJson, double width, double height, double safeArea) {
        JsonNode elements;
        try {
            elements = JSON.readTree(elementsJson);
        } catch (JacksonException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Das Label-Layout ist ungültig.", exception);
        }
        if (!elements.isArray()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Das Label-Layout ist ungültig.");
        }
        for (JsonNode element : elements) {
            double x = element.path("x").asDouble(0);
            double y = element.path("y").asDouble(0);
            double right = x + element.path("width").asDouble(0);
            double bottom = y + element.path("height").asDouble(0);
            if (x < safeArea - TOLERANCE_MM || y < safeArea - TOLERANCE_MM
                || right > width - safeArea + TOLERANCE_MM || bottom > height - safeArea + TOLERANCE_MM) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Alle Elemente müssen innerhalb des Sicherheitsabstands von "
                        + BigDecimal.valueOf(safeArea).stripTrailingZeros().toPlainString().replace('.', ',') + " mm liegen.");
            }
        }
    }

    private LabelTemplateResponse toResponse(LabelTemplate template) {
        return new LabelTemplateResponse(
            template.getUuid(),
            template.getName(),
            template.getDescription(),
            template.getArea().getUuid(),
            template.isDefaultForArea(),
            template.getWidthMm(),
            template.getHeightMm(),
            template.getSafeAreaMm(),
            sheetDto(template.getSheet()),
            template.getElementsJson()
        );
    }

    /** Hibernate may return an empty embeddable instead of null; incomplete sheets count as none. */
    private static LabelSheetDto sheetDto(LabelSheet sheet) {
        if (sheet == null || sheet.getPaperWidthMm() == null || sheet.getPaperHeightMm() == null
            || sheet.getColumns() == null || sheet.getRows() == null) {
            return null;
        }
        return new LabelSheetDto(sheet.getPaperWidthMm(), sheet.getPaperHeightMm(), sheet.getColumns(), sheet.getRows(),
            orZero(sheet.getMarginTopMm()), orZero(sheet.getMarginLeftMm()), orZero(sheet.getGapXMm()), orZero(sheet.getGapYMm()));
    }

    private static double orZero(Double value) {
        return value == null ? 0 : value;
    }

    private LabelTemplate templateOr404(UUID uuid) {
        return templateRepository.findByUuid(uuid)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Label template not found"));
    }

    private Area areaOr400(UUID uuid) {
        if (uuid == null) {
            return areaRepository.findFirstByDefaultAreaTrue()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Es ist kein Standardbereich festgelegt."));
        }
        return areaRepository.findByUuid(uuid)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Area not found"));
    }
}
