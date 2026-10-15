package com.jpromi.inventorycore.controller;

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

import com.jpromi.inventorycore.dto.LabelTemplateRequest;
import com.jpromi.inventorycore.dto.LabelTemplateResponse;
import com.jpromi.inventorycore.dto.PageResponse;
import com.jpromi.inventorycore.service.Paging;
import com.jpromi.inventorycore.entity.Area;
import com.jpromi.inventorycore.entity.LabelTemplate;
import com.jpromi.inventorycore.enums.PermissionAction;
import com.jpromi.inventorycore.enums.PermissionResourceType;
import com.jpromi.inventorycore.repository.AreaRepository;
import com.jpromi.inventorycore.repository.LabelTemplateRepository;
import com.jpromi.inventorycore.service.AccessContext;
import com.jpromi.inventorycore.enums.AuditAction;
import com.jpromi.inventorycore.enums.AuditObjectType;
import com.jpromi.inventorycore.service.AuditService;
import com.jpromi.inventorycore.service.PermissionService;

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

    private final LabelTemplateRepository templateRepository;
    private final AreaRepository areaRepository;
    private final PermissionService permissionService;

    private final AuditService audit;

    public LabelTemplateController(
        LabelTemplateRepository templateRepository,
        AreaRepository areaRepository,
        PermissionService permissionService,
        AuditService audit
    ) {
        this.templateRepository = templateRepository;
        this.areaRepository = areaRepository;
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
        template.setName(request.name().trim());
        template.setDescription(request.description());
        template.setWidthMm(request.widthMm());
        template.setHeightMm(request.heightMm());
        template.setElementsJson(request.elementsJson() == null || request.elementsJson().isBlank() ? "[]" : request.elementsJson());
        if (request.defaultForArea() && !template.isDefaultForArea()) {
            // only one default per area
            templateRepository.findByAreaAndDefaultForAreaTrue(template.getArea()).forEach(previous -> {
                previous.setDefaultForArea(false);
                templateRepository.save(previous);
            });
        }
        template.setDefaultForArea(request.defaultForArea());
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
            template.getElementsJson()
        );
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
