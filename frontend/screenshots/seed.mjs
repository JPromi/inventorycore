// Fills an EMPTY InventoryCore instance with fire-service example data for the README screenshots.
// Usage: node screenshots/seed.mjs http://localhost:8091 <admin user> <admin password>
// Never run it against a real installation: it creates areas, assets and inspections.

const [base = 'http://localhost:8091', username = 'inv', password = 'core'] = process.argv.slice(2);
let cookie = '';

async function call(method, path, body) {
  const response = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    cookie = setCookie.split(';')[0];
  }
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

await call('POST', '/api/auth', { username, password });
if ((await call('GET', '/api/assets')).length) {
  throw new Error('The instance already has assets; the example data is only for an empty instance.');
}

// ---- areas ----
const areas = await call('GET', '/api/admin/areas');
const defaultArea = areas.find((area) => area.defaultArea);
const general = defaultArea.uuid;
await call('PATCH', `/api/admin/areas/${general}`, { name: 'Allgemein', description: 'Alles ohne eigene Zuordnung', color: '#475569', defaultArea: true });
const area = async (name, color, description) => (await call('POST', '/api/admin/areas', { name, color, description, defaultArea: false })).uuid;
const breathing = await area('Atemschutz', '#b62f2f', 'Atemschutzgeräte, Masken und Flaschen');
const vehicles = await area('Fahrzeuge', '#2563eb', 'Fahrzeuge und feste Beladung');
const stores = await area('Zeugmeister', '#d97706', 'Bekleidung, Schläuche und Kleinmaterial');

// ---- tags ----
const tag = async (name, color) => (await call('POST', '/api/tags', { name, color })).uuid;
const mandatory = await tag('Prüfpflichtig', '#b62f2f');
const electric = await tag('Elektro', '#ca8a04');
const hydraulic = await tag('Hydraulik', '#7c3aed');
const reserve = await tag('Reserve', '#475569');
const radio = await tag('Funk', '#0891b2');

// ---- asset types ----
const field = (name, fieldType, sortOrder, options, required = false) => ({
  name, fieldKey: null, fieldType, optionsJson: options ? JSON.stringify(options) : null, required, typeField: true, sortOrder,
});
const type = async (name, description, areaUuids, fieldDefinitions, tagUuids = [], inspectionIntervalDays = null) =>
  (await call('POST', '/api/asset-types', { name, description, inspectionIntervalDays, fieldDefinitions, images: [], tagUuids, areaUuids })).uuid;
const pa = await type('Pressluftatmer', 'Umluftunabhängiges Atemschutzgerät', [breathing], [
  field('Hersteller', 'SELECT', 0, ['Dräger', 'MSA', 'Interspiro'], true),
  field('Flaschendruck (bar)', 'NUMBER', 1),
  field('Nächste Flaschenprüfung', 'DATE', 2),
  field('Einsatzbereit', 'BOOLEAN', 3),
], [mandatory]);
const mask = await type('Atemschutzmaske', 'Vollmaske mit Normaldruck- oder Überdruckanschluss', [breathing], [
  field('Größe', 'SELECT', 0, ['S', 'M', 'L']),
], [mandatory]);
const rescue = await type('Hydraulisches Rettungsgerät', 'Schere, Spreizer und Rettungszylinder', [vehicles], [
  field('Hersteller', 'TEXT', 0),
  field('Betriebsdruck (bar)', 'NUMBER', 1),
], [hydraulic, mandatory]);
const generator = await type('Stromerzeuger', 'Tragbarer Stromerzeuger nach DIN 14685', [vehicles], [
  field('Leistung (kVA)', 'NUMBER', 0),
  field('Betriebsstunden', 'NUMBER', 1),
], [electric, mandatory]);
const pump = await type('Tragkraftspritze', 'PFPN 10-1000', [vehicles], [field('Betriebsstunden', 'NUMBER', 0)], [mandatory]);
const handheld = await type('Handfunkgerät', 'Digitalfunk HRT', [vehicles, stores], [field('OPTA', 'TEXT', 0)], [radio]);
const hose = await type('Druckschlauch', 'Druckschlauch nach DIN 14811', [stores], [
  field('Größe', 'SELECT', 0, ['B 75', 'C 52', 'C 42', 'D 25']),
  field('Länge (m)', 'NUMBER', 1),
]);

// ---- locations ----
const location = async (name, locationType, areaUuids, parentLocationUuid = null, extra = {}) =>
  (await call('POST', '/api/locations', {
    name, description: null, locationType, parentLocationUuid, images: [], areaUuids, shared: false, ...extra,
  })).uuid;
const station = await location('Feuerwehrhaus Musterstadt', 'BUILDING', [general], null, {
  street: 'Florianiplatz 1', postalCode: '1010', city: 'Wien', country: 'Österreich', latitude: 48.2085, longitude: 16.3721,
});
const hall = await location('Fahrzeughalle', 'ROOM', [vehicles], station);
const workshop = await location('Atemschutzwerkstatt', 'ROOM', [breathing], station);
const store = await location('Lager', 'WAREHOUSE', [stores, breathing], station, { shared: true, description: 'Gemeinsames Lager: jeder Bereich sieht seine eigenen Sachen' });
const hlf = await location('HLF 20', 'VEHICLE', [vehicles], hall, { description: 'Hilfeleistungslöschfahrzeug' });
const tlf = await location('TLF 3000', 'VEHICLE', [vehicles], hall, { description: 'Tanklöschfahrzeug' });
const g1 = await location('Geräteraum G1', 'CABINET', [vehicles], hlf);
const g2 = await location('Geräteraum G2', 'CABINET', [vehicles], hlf);
const shelf = await location('Regal A', 'SHELF', [stores], store);

// ---- assets ----
const statuses = await call('GET', '/api/asset-statuses');
const status = (key) => statuses.find((entry) => entry.systemKey === key).uuid;
let number = 40;
const asset = async (name, assetTypeUuid, locationUuid, areaUuids, values = {}, extra = {}) => {
  number += 1;
  const definitions = assetTypeUuid ? (await call("GET", `/api/asset-types/${assetTypeUuid}`)).fieldDefinitions : [];
  const fieldValues = definitions.map((definition) => ({
    fieldKey: definition.fieldKey, name: definition.name, value: values[definition.name] ?? '', customAssetField: false,
  }));
  return call('POST', '/api/assets', {
    invId: `FW-2026-${String(number).padStart(4, '0')}`, name, description: null, assetTypeUuid, locationUuid,
    tagUuids: [], fieldValues, images: [], areaUuids, inspectionPolicy: 'STANDARD', ...extra,
  });
};
const pas = [];
for (let index = 1; index <= 6; index++) {
  pas.push(await asset(`Atemschutzgerät PA ${index}`, pa, index <= 4 ? g1 : workshop, [breathing], {
    Hersteller: index % 3 === 0 ? 'MSA' : 'Dräger', 'Flaschendruck (bar)': '300', 'Nächste Flaschenprüfung': `2027-0${(index % 9) + 1}-15`, Einsatzbereit: 'true',
  }, { serialNumber: `ARAL-${4810 + index}` }));
}
for (let index = 1; index <= 4; index++) {
  await asset(`Atemschutzmaske M${index}`, mask, index <= 2 ? g1 : shelf, [breathing], { Größe: ['M', 'L', 'M', 'S'][index - 1] });
}
const cutter = await asset('Rettungsschere S 311', rescue, g2, [vehicles], { Hersteller: 'Weber Rescue', 'Betriebsdruck (bar)': '720' }, { serialNumber: 'WR-311-0457' });
await asset('Spreizer SP 49', rescue, g2, [vehicles], { Hersteller: 'Weber Rescue', 'Betriebsdruck (bar)': '720' });
const powerUnit = await asset('Stromerzeuger 8 kVA', generator, g2, [vehicles], { 'Leistung (kVA)': '8', Betriebsstunden: '312' });
await asset('Tragkraftspritze TS 10', pump, tlf, [vehicles], { Betriebsstunden: '128' });
for (let index = 1; index <= 3; index++) {
  await asset(`Handfunkgerät HRT ${index}`, handheld, hlf, [vehicles], { OPTA: `WIE-HLF20-${index}` });
}
for (const [size, count] of [['B 75', 3], ['C 52', 4]]) {
  for (let index = 1; index <= count; index++) {
    await asset(`Druckschlauch ${size} Nr. ${index}`, hose, shelf, [stores], { Größe: size, 'Länge (m)': '20' });
  }
}
const old = await asset('Wärmebildkamera (alt)', null, shelf, [stores], {});

// statuses with a history
await call('POST', `/api/assets/${pas[4].uuid}/status`, { statusUuid: status('DEFECT'), comment: 'Lungenautomat bläst ab, Dichtring prüfen' });
await call('POST', `/api/assets/${pas[4].uuid}/status`, { statusUuid: status('IN_REPAIR'), comment: 'Zur Atemschutzwerkstatt des Bezirks gebracht' });
await call('POST', `/api/assets/${powerUnit.uuid}/status`, { statusUuid: status('DEFECT'), comment: 'Springt nach Leerlauf nicht mehr an' });
await call('POST', `/api/assets/${old.uuid}/status`, { statusUuid: status('RETIRED'), comment: 'Ersetzt durch neue Wärmebildkamera' });
await call('POST', `/api/assets/${pas[5].uuid}/status`, { statusUuid: status('IN_DELIVERY'), comment: 'Bestellt über Landesfeuerwehrverband' });

// ---- inspection templates ----
const yearly = await call('POST', '/api/inspection-types', {
  name: 'Jahresprüfung Atemschutz', description: 'Prüfung nach Herstellerangaben', color: '#b62f2f', mode: 'CHECK',
  intervalValue: 12, intervalUnit: 'MONTHS', checkFunction: true, assetTypeUuids: [pa, mask], areaUuids: [breathing],
  fields: [
    { uuid: null, assetTypeUuid: pa, name: 'Hochdruckdichtheit', fieldType: 'BOOLEAN', optionsJson: null, required: true, sortOrder: 0 },
    { uuid: null, assetTypeUuid: pa, name: 'Flaschendruck (bar)', fieldType: 'NUMBER', optionsJson: null, required: true, sortOrder: 1 },
  ],
  defaultTagUuids: [], includeChildAssets: false, defaultAssetTypeUuids: [pa, mask], defaultLocationUuids: [], recurringTagUuids: [], protocolAreaUuid: breathing,
});
const inventory = await call('POST', '/api/inspection-types', {
  name: 'Fahrzeuginventur', description: 'Beladung nach Beladeplan', color: '#2563eb', mode: 'INVENTORY',
  intervalValue: 3, intervalUnit: 'MONTHS', checkFunction: false, assetTypeUuids: [], areaUuids: [vehicles], fields: [],
  defaultTagUuids: [], includeChildAssets: false, defaultAssetTypeUuids: [], defaultLocationUuids: [hlf], recurringTagUuids: [], protocolAreaUuid: vehicles,
});

// a completed inventory of the HLF: one radio missing
const run = await call('POST', '/api/inspections', {
  inspectionTypeUuid: inventory.uuid, title: 'Inventur HLF 20', checkFunction: false, onlyDue: false, includeChildAssets: false, areaUuid: vehicles,
  filter: { locationUuid: hlf, includeSubLocations: true, tagUuids: [], assetTypeUuids: [], areaUuids: [], locationUuids: [hlf] },
});
const runDetail = await call('GET', `/api/inspections/${run.summary?.uuid ?? run.uuid}`);
const runUuid = runDetail.summary?.uuid ?? runDetail.uuid;
for (const [index, item] of runDetail.items.entries()) {
  await call('PATCH', `/api/inspections/${runUuid}/items/${item.uuid}`, { status: index === 1 ? 'MISSING' : 'PRESENT', note: null, condition: null, values: null });
}
await call('POST', `/api/inspections/${runUuid}/complete`, { comment: 'Handfunkgerät HRT 2 liegt beim Funkwart.' });

// an open yearly check of the breathing apparatus, half done
const check = await call('POST', '/api/inspections', {
  inspectionTypeUuid: yearly.uuid, title: 'Jahresprüfung Atemschutz 2026', checkFunction: true, onlyDue: false, includeChildAssets: false, areaUuid: breathing,
  filter: { locationUuid: null, includeSubLocations: false, tagUuids: [], assetTypeUuids: [pa], areaUuids: [breathing], locationUuids: [] },
});
const checkDetail = await call('GET', `/api/inspections/${check.summary?.uuid ?? check.uuid}`);
const checkUuid = checkDetail.summary?.uuid ?? checkDetail.uuid;
for (const [index, item] of checkDetail.items.slice(0, 3).entries()) {
  await call('PATCH', `/api/inspections/${checkUuid}/items/${item.uuid}`, { status: index === 2 ? 'FAILED' : 'PASSED', note: index === 2 ? 'Manometer zeigt 20 bar zu wenig' : null, condition: null, values: null });
}

// ---- groups, permissions and users ----
const right = (resourceType, areaUuid, rights) => ({
  resourceType, areaUuid, canView: true, canCreate: false, canEdit: false, canDelete: false, canInspect: false, admin: false, ...rights,
});
const group = async (name, permissions) => (await call('POST', '/api/admin/groups', { name, permissions, adminGroup: false })).uuid;
const wardens = await group('Atemschutzgerätewarte', [
  right(null, breathing, { canCreate: true, canEdit: true, canInspect: true, canDelete: true }),
  right('LOCATION', null, {}),
]);
const machinists = await group('Maschinisten', [
  right('ASSET', vehicles, { canEdit: true, canInspect: true }),
  right('LOCATION', vehicles, { canEdit: true }),
]);
const quartermasters = await group('Zeugmeister', [
  right(null, stores, { canCreate: true, canEdit: true, canDelete: true }),
  right('ASSET_TYPE', stores, { canCreate: true, canEdit: true }),
]);
// everyone may look at the vehicles
const everyone = (await call('GET', '/api/admin/groups')).find((entry) => entry.everyone);
await call('POST', `/api/admin/groups/${everyone.uuid}/permissions`, right('ASSET', vehicles, {}));
const person = (username, displayName, groupUuids) => call('POST', '/api/admin/users', {
  username, displayName, password: 'Beispiel-2026!', email: `${username}@feuerwehr.example`, role: 'USER', enabled: true, groupUuids,
});
await person('mhuber', 'Michael Huber', [wardens]);
await person('sbauer', 'Sarah Bauer', [wardens, machinists]);
await person('tgruber', 'Thomas Gruber', [machinists]);
await person('lwagner', 'Lisa Wagner', [quartermasters]);

console.log(JSON.stringify({ pa1: pas[0].uuid, cutter: cutter.uuid, inventory: runUuid, check: checkUuid, hlf, station }));
