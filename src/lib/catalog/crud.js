const { adminGql } = require("./graphql.cjs");

function normalizeTaxonomy(v) {
  return String(v || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizeMuscleCode(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

async function ensureLookup(table, code) {
  const isMuscle = table === 'catalog_muscles';
  const c = isMuscle ? normalizeMuscleCode(code) : normalizeTaxonomy(code);
  if (!c) throw new Error(`Empty code for ${table}`);
  const qname = table; // GraphQL root field = table name
  const existing = await adminGql(
    `query($code: String!) { ${qname}(where: { code: { _eq: $code } }, limit: 1) { id code } }`,
    { code: c }
  );
  const hit = existing[qname]?.[0];
  if (hit) return hit;
  const name = isMuscle
    ? c.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())
    : c.replace(/_/g, ' ');
  const ins = await adminGql(
    `mutation($o: ${table}_insert_input!) {
      insert_${table}_one(object: $o) { id code }
    }`,
    { o: { code: c, name, active: true } }
  );
  return ins[`insert_${table}_one`];
}

function inferLoadModalityCode(payload) {
  const name = String(payload.display_name || '');
  const eq = normalizeTaxonomy(payload.equipment_code || payload.equipment);
  const mt = normalizeTaxonomy(payload.movement_type_code || payload.movement_type);
  const mg = normalizeTaxonomy(payload.primary_muscle_group_code || payload.muscle_group);
  if (/assist/i.test(name)) return 'ASSISTED';
  if (/resist/i.test(name)) return 'RESISTED';
  if (eq === 'BODYWEIGHT') return 'NEUTRAL';
  if (mt === 'CARDIO' || mg === 'CARDIO' || eq === 'BYCICLE' || eq === 'BICYCLE') {
    return 'NEUTRAL';
  }
  return 'RESISTED';
}

/** UI + volume: TIME for HOLD / CARDIO group / CARDIO movement; else LOAD. */
function inferLoggingModeCode(payload) {
  const mt = normalizeTaxonomy(payload.movement_type_code || payload.movement_type);
  const mg = normalizeTaxonomy(payload.primary_muscle_group_code || payload.muscle_group);
  if (mt === 'HOLD' || mg === 'CARDIO' || mt === 'CARDIO') return 'TIME';
  return 'LOAD';
}

async function resolveXcatIds(payload) {
  const mg = await ensureLookup(
    'catalog_muscle_groups',
    payload.primary_muscle_group_code || payload.muscle_group
  );
  const mt = await ensureLookup(
    'catalog_movement_types',
    payload.movement_type_code || payload.movement_type
  );
  const eq = await ensureLookup(
    'catalog_equipment',
    payload.equipment_code || payload.equipment
  );
  const va = await ensureLookup(
    'catalog_variations',
    payload.variation_code || payload.variation || 'STANDARD'
  );
  const po = await ensureLookup(
    'catalog_positions',
    payload.position_code || payload.position || 'NEUTRAL'
  );
  const gr = await ensureLookup(
    'catalog_grips',
    payload.grip_code || payload.grip || 'STANDARD'
  );
  const lm = await ensureLookup(
    'catalog_load_modalities',
    payload.load_modality_code ||
      payload.load_modality ||
      inferLoadModalityCode(payload)
  );
  const logm = await ensureLookup(
    'catalog_logging_modes',
    payload.logging_mode_code ||
      payload.logging_mode ||
      inferLoggingModeCode(payload)
  );

  let targetId = null;
  const targetCode = String(payload.target_muscle_code || '').trim();
  if (targetCode) {
    targetId = (await ensureLookup('catalog_muscles', targetCode)).id;
  }

  const secondaryIds = [];
  const seen = new Set();
  for (const raw of payload.secondary_muscle_codes || []) {
    const code = String(raw || '').trim();
    if (!code || (targetCode && code === targetCode)) continue;
    const id = (await ensureLookup('catalog_muscles', code)).id;
    if (targetId && id === targetId) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    secondaryIds.push(id);
  }

  return { mg, mt, eq, va, po, gr, lm, logm, targetId, secondaryIds };
}

function firstFreeExoId(ids) {
  const used = new Set();
  for (const raw of ids || []) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) used.add(n);
  }
  let next = 1;
  while (used.has(next)) next += 1;
  return next;
}

async function nextXcatExoId() {
  // Include inactive rows so soft-held ids are not reused.
  const data = await adminGql(
    `{ catalog_exercises(order_by: { exo_id: asc }) { exo_id } }`
  );
  return firstFreeExoId((data.catalog_exercises || []).map((r) => r.exo_id));
}

function normalizeXcatStatus(raw) {
  const s = String(raw || 'migrated').trim();
  if (s === 'pending_review' || s === 'pending') return 'pending';
  if (s === 'migrated') return 'migrated';
  throw new Error(`Invalid taxonomy_status "${raw}" (use migrated|pending)`);
}

/** Fields required for taxonomy_status = migrated. */
function xcatRequiredGaps(payload) {
  const gaps = [];
  const check = (label, value) => {
    if (!String(value || '').trim()) gaps.push(label);
  };
  check('display_name', payload.display_name);
  check(
    'primary_muscle_group',
    payload.primary_muscle_group_code || payload.muscle_group
  );
  check('movement_type', payload.movement_type_code || payload.movement_type);
  check('equipment', payload.equipment_code || payload.equipment);
  check('position', payload.position_code || payload.position);
  check('grip', payload.grip_code || payload.grip);
  check('variation', payload.variation_code || payload.variation);
  check('target_muscle', payload.target_muscle_code);
  return gaps;
}

function resolveXcatTaxonomyStatus(payload, requestedRaw) {
  const gaps = xcatRequiredGaps(payload);
  let status = normalizeXcatStatus(requestedRaw || 'migrated');
  if (gaps.length && status === 'migrated') {
    status = 'pending';
  }
  return { status, gaps };
}

async function fetchXcatByExoId(exoId) {
  const found = await adminGql(
    `query($exo_id: Int!) {
      catalog_exercises(where: { exo_id: { _eq: $exo_id } }, limit: 1) {
        id exo_id taxonomy_status active display_name
        body_mass_coefficient wrist_imu_mode default_pulley_ratio
      }
    }`,
    { exo_id: exoId }
  );
  return found.catalog_exercises?.[0] || null;
}

function parseBiomechanicalFields(payload) {
  const wristRaw = String(payload.wrist_imu_mode || 'DYNAMIC').trim().toUpperCase();
  const wrist_imu_mode = wristRaw === 'STATIC' ? 'STATIC' : 'DYNAMIC';
  let body_mass_coefficient = null;
  if (
    payload.body_mass_coefficient !== undefined &&
    payload.body_mass_coefficient !== null &&
    String(payload.body_mass_coefficient).trim() !== ''
  ) {
    const n = Number(payload.body_mass_coefficient);
    if (!Number.isFinite(n) || n < 0 || n > 1.5) {
      throw new Error('body_mass_coefficient must be empty or a number in [0, 1.5]');
    }
    body_mass_coefficient = n;
  }
  let default_pulley_ratio = 1.0;
  if (
    payload.default_pulley_ratio !== undefined &&
    payload.default_pulley_ratio !== null &&
    String(payload.default_pulley_ratio).trim() !== ''
  ) {
    const p = Number(payload.default_pulley_ratio);
    if (!Number.isFinite(p) || p <= 0) throw new Error('default_pulley_ratio must be > 0');
    default_pulley_ratio = p;
  }
  return { body_mass_coefficient, wrist_imu_mode, default_pulley_ratio };
}

async function composeXcatExercise(payload) {
  const displayName = String(payload.display_name || '').trim();
  if (!displayName) throw new Error('display_name is required');

  const dup = await adminGql(
    `query($name: String!) {
      catalog_exercises(
        where: { active: { _eq: true }, display_name: { _ilike: $name } }
        limit: 5
      ) { exo_id display_name }
    }`,
    { name: displayName }
  );
  const clash = (dup.catalog_exercises || []).find(
    (e) => String(e.display_name || '').trim().toLowerCase() === displayName.toLowerCase()
  );
  if (clash) throw new Error(`display_name already used by exo_id ${clash.exo_id}`);

  const ids = await resolveXcatIds(payload);
  const exoId = payload.exo_id ? Number(payload.exo_id) : await nextXcatExoId();
  const { status: taxonomyStatus, gaps } = resolveXcatTaxonomyStatus(
    payload,
    payload.taxonomy_status || 'migrated'
  );
  if (
    gaps.length &&
    normalizeXcatStatus(payload.taxonomy_status || 'migrated') === 'migrated'
  ) {
    // Keep save, but never allow migrated when incomplete.
    console.warn(
      `xcat compose exo_id=${exoId}: coerced to pending (missing: ${gaps.join(', ')})`
    );
  }

  const biomech = parseBiomechanicalFields(payload);
  const description = payload.description ? String(payload.description).trim() : null;
  const obj = {
    exo_id: exoId,
    display_name: displayName,
    primary_muscle_group_id: ids.mg.id,
    target_muscle_id: ids.targetId,
    movement_type_id: ids.mt.id,
    equipment_id: ids.eq.id,
    variation_id: ids.va.id,
    position_id: ids.po.id,
    grip_id: ids.gr.id,
    load_modality_id: ids.lm.id,
    logging_mode_id: ids.logm.id,
    body_mass_coefficient: biomech.body_mass_coefficient,
    wrist_imu_mode: biomech.wrist_imu_mode,
    default_pulley_ratio: biomech.default_pulley_ratio,
    taxonomy_status: taxonomyStatus,
    taxonomy_notes: payload.taxonomy_notes || null,
    active: true,
    localizations: {
      data: [
        {
          locale: 'en',
          display_name: displayName,
          description,
        },
      ],
    },
    secondary_muscles: {
      data: ids.secondaryIds.map((muscle_id, i) => ({
        muscle_id,
        sort_order: i
      }))
    }
  };

  const data = await adminGql(
    `mutation($o: catalog_exercises_insert_input!) {
      insert_catalog_exercises_one(object: $o) {
        id exo_id display_name taxonomy_status
      }
    }`,
    { o: obj }
  );
  return data.insert_catalog_exercises_one;
}

/**
 * Simplified user custom create into workout.custom_exercises (UUID PK, no exo_id).
 * required: display_name, muscle group, movement, equipment, target_muscle, user_id
 * optional: load/logging (server trigger fills defaults)
 */
async function composeCustomXcatExercise(payload) {
  const displayName = String(payload.display_name || '').trim();
  if (!displayName) throw new Error('display_name is required');

  const userId = String(payload.user_id || '').trim();
  if (!userId) throw new Error('user_id is required for custom exercises');

  const mgCode = payload.primary_muscle_group_code || payload.muscle_group;
  const mtCode = payload.movement_type_code || payload.movement_type;
  const eqCode = payload.equipment_code || payload.equipment;
  const targetCode = payload.target_muscle_code || payload.target_muscle;
  if (!String(mgCode || '').trim()) throw new Error('primary_muscle_group is required');
  if (!String(mtCode || '').trim()) throw new Error('movement_type is required');
  if (!String(eqCode || '').trim()) throw new Error('equipment is required');
  if (!String(targetCode || '').trim()) throw new Error('target_muscle is required');

  const ids = await resolveXcatIds({
    display_name: displayName,
    primary_muscle_group_code: mgCode,
    movement_type_code: mtCode,
    equipment_code: eqCode,
    position_code: 'NEUTRAL',
    grip_code: 'STANDARD',
    variation_code: 'STANDARD',
    target_muscle_code: targetCode,
    load_modality_code: payload.load_modality_code || null,
    logging_mode_code: payload.logging_mode_code || null
  });

  if (!ids.targetId) throw new Error('target_muscle is required');

  const biomech = parseBiomechanicalFields(payload);
  const obj = {
    user_id: userId,
    display_name: displayName,
    primary_muscle_group_id: ids.mg.id,
    target_muscle_id: ids.targetId,
    movement_type_id: ids.mt.id,
    equipment_id: ids.eq.id,
    load_modality_id: ids.lm.id,
    logging_mode_id: ids.logm.id,
    body_mass_coefficient: biomech.body_mass_coefficient,
    default_pulley_ratio: biomech.default_pulley_ratio,
    active: true
  };

  const data = await adminGql(
    `mutation($o: workout_custom_exercises_insert_input!) {
      insert_workout_custom_exercises_one(object: $o) {
        id display_name user_id active
      }
    }`,
    { o: obj }
  );
  return data.insert_workout_custom_exercises_one;
}

async function listAuthUsers() {
  const data = await adminGql(`
    query AuthUsers {
      users(limit: 100, order_by: { email: asc }) {
        id
        email
        displayName
      }
    }
  `);
  return data.users || [];
}

async function listXcatLibraryAdmin() {
  const data = await adminGql(`
    query XcatLibraryAdmin {
      catalog_exercises(where: { active: { _eq: true } }, order_by: { exo_id: asc }) {
        id
        exo_id
        display_name
        localizations(where: { locale: { _eq: "en" } }, limit: 1) {
          locale
          display_name
          description
        }
        taxonomy_status
        taxonomy_notes
        primary_muscle_group { code name }
        target_muscle { code name }
        movement_type { code name }
        equipment { code name }
        variation { code name }
        position { code name }
        grip { code name }
        load_modality { code name }
        logging_mode { code name }
        body_mass_coefficient
        wrist_imu_mode
        default_pulley_ratio
        secondary_muscles(order_by: { sort_order: asc }) {
          muscle { code name }
        }
        extra_muscle_groups {
          muscle_group { code name }
        }
      }
      catalog_muscle_groups(where: { active: { _eq: true } }, order_by: { sort_order: asc }) {
        id code name
      }
      catalog_muscles(where: { active: { _eq: true } }, order_by: { code: asc }) {
        id code name
      }
      catalog_movement_types(where: { active: { _eq: true } }, order_by: { sort_order: asc, code: asc }) {
        id code name
      }
      catalog_equipment(where: { active: { _eq: true } }, order_by: { sort_order: asc, code: asc }) {
        id code name
      }
      catalog_load_modalities(where: { active: { _eq: true } }, order_by: { sort_order: asc, code: asc }) {
        id code name
      }
      catalog_logging_modes(where: { active: { _eq: true } }, order_by: { sort_order: asc, code: asc }) {
        id code name
      }
    }
  `);
  return data;
}

async function updateXcatExercise(payload) {
  const exoId = Number(payload.exo_id);
  if (!Number.isFinite(exoId)) throw new Error('exo_id required');
  const displayName = String(payload.display_name || '').trim();
  if (!displayName) throw new Error('display_name is required');

  const current = await fetchXcatByExoId(exoId);
  if (!current) throw new Error(`No xcat exercise for exo_id ${exoId}`);
  const currentStatus = normalizeXcatStatus(current.taxonomy_status);
  const { status: nextStatus, gaps } = resolveXcatTaxonomyStatus(
    payload,
    payload.taxonomy_status || currentStatus
  );

  // Migrated rows may be edited in one save (UI unlocks via pending first).
  // Completeness is still enforced when targeting migrated.
  if (
    gaps.length &&
    normalizeXcatStatus(payload.taxonomy_status || currentStatus) === 'migrated'
  ) {
    throw new Error(
      `Cannot set migrated while incomplete (missing: ${gaps.join(', ')}). Use pending.`
    );
  }

  const ids = await resolveXcatIds(payload);
  const exerciseId = current.id;
  const biomech = parseBiomechanicalFields(payload);

  const description = payload.description ? String(payload.description).trim() : null;
  const set = {
    display_name: displayName,
    primary_muscle_group_id: ids.mg.id,
    target_muscle_id: ids.targetId,
    movement_type_id: ids.mt.id,
    equipment_id: ids.eq.id,
    variation_id: ids.va.id,
    position_id: ids.po.id,
    grip_id: ids.gr.id,
    load_modality_id: ids.lm.id,
    logging_mode_id: ids.logm.id,
    body_mass_coefficient: biomech.body_mass_coefficient,
    wrist_imu_mode: biomech.wrist_imu_mode,
    default_pulley_ratio: biomech.default_pulley_ratio,
    taxonomy_status: nextStatus,
    taxonomy_notes: payload.taxonomy_notes || null
  };

  await adminGql(
    `mutation($id: uuid!, $set: catalog_exercises_set_input!, $name: String!, $desc: String) {
      delete_catalog_exercise_secondary_muscles(where: { exercise_id: { _eq: $id } }) { affected_rows }
      update_catalog_exercises_by_pk(pk_columns: { id: $id }, _set: $set) { id exo_id }
      delete_catalog_exercise_localizations(
        where: { exercise_id: { _eq: $id }, locale: { _eq: "en" } }
      ) { affected_rows }
      insert_catalog_exercise_localizations_one(
        object: { exercise_id: $id, locale: "en", display_name: $name, description: $desc }
      ) { id }
    }`,
    { id: exerciseId, set, name: displayName, desc: description }
  );

  if (ids.secondaryIds.length) {
    await adminGql(
      `mutation($objects: [catalog_exercise_secondary_muscles_insert_input!]!) {
        insert_catalog_exercise_secondary_muscles(objects: $objects) { affected_rows }
      }`,
      {
        objects: ids.secondaryIds.map((muscle_id, i) => ({
          exercise_id: exerciseId,
          muscle_id,
          sort_order: i
        }))
      }
    );
  }
  return { id: exerciseId, exo_id: exoId, taxonomy_status: nextStatus };
}

async function deactivateXcatExercise(payload) {
  const exoId = Number(payload.exo_id);
  if (!Number.isFinite(exoId)) throw new Error('exo_id required');
  const current = await fetchXcatByExoId(exoId);
  if (!current) throw new Error(`No xcat exercise for exo_id ${exoId}`);
  if (current.active === false) {
    return { exo_id: exoId, deactivated: true, already: true };
  }
  const status = normalizeXcatStatus(current.taxonomy_status);
  if (status === 'migrated') {
    throw new Error(
      'Migrated exercises cannot be deactivated. Set status to pending first.'
    );
  }
  await adminGql(
    `mutation($id: uuid!) {
      update_catalog_exercises_by_pk(
        pk_columns: { id: $id }
        _set: { active: false }
      ) { id exo_id active }
    }`,
    { id: current.id }
  );
  return { exo_id: exoId, deactivated: true };
}

const LOOKUP_TABLES = new Set([
  'catalog_muscle_groups',
  'catalog_muscles',
  'catalog_movement_types',
  'catalog_equipment',
  'catalog_variations',
  'catalog_positions',
  'catalog_grips',
  'catalog_load_modalities',
  'catalog_logging_modes'
]);

async function upsertLookup(payload) {
  const table = String(payload.table || '');
  if (!LOOKUP_TABLES.has(table)) throw new Error('Invalid lookup table');
  const row = await ensureLookup(table, payload.code);
  if (table === 'catalog_muscles' && payload.muscle_group_code) {
    const g = await ensureLookup('catalog_muscle_groups', payload.muscle_group_code);
    const role = ['target', 'secondary'].includes(payload.role) ? payload.role : 'target';
    if (role === 'target') {
      await adminGql(
        `mutation($m: uuid!, $mg: uuid!) {
          delete_catalog_muscle_group_muscles(
            where: { muscle_id: { _eq: $m }, role: { _eq: "target" }, muscle_group_id: { _neq: $mg } }
          ) { affected_rows }
        }`,
        { m: row.id, mg: g.id }
      );
    }
    await adminGql(
      `mutation($mg: uuid!, $m: uuid!, $role: String!) {
        insert_catalog_muscle_group_muscles(
          objects: [{ muscle_group_id: $mg, muscle_id: $m, role: $role }]
          on_conflict: { constraint: muscle_group_muscles_pkey, update_columns: [role] }
        ) { affected_rows }
      }`,
      { mg: g.id, m: row.id, role }
    );
  }
  return row;
}

async function manageRelation(payload) {
  const action = String(payload.action || '');
  const kind = String(payload.kind || '');
  if (!['link', 'unlink'].includes(action)) throw new Error('action must be link|unlink');
  if (!['muscle', 'movement'].includes(kind)) throw new Error('kind must be muscle|movement');

  const g = await ensureLookup('catalog_muscle_groups', payload.muscle_group_code);
  if (kind === 'muscle') {
    const m = await ensureLookup('catalog_muscles', payload.code);
    const role = ['target', 'secondary'].includes(payload.role) ? payload.role : 'target';
    if (action === 'link') {
      if (role === 'target') {
        await adminGql(
          `mutation($m: uuid!, $mg: uuid!) {
            delete_catalog_muscle_group_muscles(
              where: {
                muscle_id: { _eq: $m }
                role: { _eq: "target" }
                muscle_group_id: { _neq: $mg }
              }
            ) { affected_rows }
          }`,
          { m: m.id, mg: g.id }
        );
      }
      await adminGql(
        `mutation($mg: uuid!, $m: uuid!, $role: String!) {
          insert_catalog_muscle_group_muscles(
            objects: [{ muscle_group_id: $mg, muscle_id: $m, role: $role }]
            on_conflict: { constraint: muscle_group_muscles_pkey, update_columns: [role] }
          ) { affected_rows }
        }`,
        { mg: g.id, m: m.id, role }
      );
    } else {
      await adminGql(
        `mutation($mg: uuid!, $m: uuid!) {
          delete_catalog_muscle_group_muscles(
            where: { muscle_group_id: { _eq: $mg }, muscle_id: { _eq: $m } }
          ) { affected_rows }
        }`,
        { mg: g.id, m: m.id }
      );
    }
  } else {
    const mt = await ensureLookup('catalog_movement_types', payload.code);
    if (action === 'link') {
      await adminGql(
        `mutation($mg: uuid!, $mt: uuid!) {
          insert_catalog_muscle_group_movement_types(
            objects: [{ muscle_group_id: $mg, movement_type_id: $mt }]
            on_conflict: { constraint: muscle_group_movement_types_pkey, update_columns: [] }
          ) { affected_rows }
        }`,
        { mg: g.id, mt: mt.id }
      );
    } else {
      await adminGql(
        `mutation($mg: uuid!, $mt: uuid!) {
          delete_catalog_muscle_group_movement_types(
            where: { muscle_group_id: { _eq: $mg }, movement_type_id: { _eq: $mt } }
          ) { affected_rows }
        }`,
        { mg: g.id, mt: mt.id }
      );
    }
  }
}

async function updateLookup(payload) {
  const table = String(payload.table || '');
  if (!LOOKUP_TABLES.has(table)) throw new Error('Invalid lookup table');
  const id = String(payload.id || '');
  if (!id) throw new Error('id required');
  const set = {};
  if (payload.name != null) set.name = String(payload.name).trim();
  if (payload.active != null) set.active = Boolean(payload.active);
  if (payload.sort_order != null) set.sort_order = Number(payload.sort_order);
  if (!Object.keys(set).length) throw new Error('nothing to update');
  const data = await adminGql(
    `mutation($id: uuid!, $set: ${table}_set_input!) {
      update_${table}_by_pk(pk_columns: { id: $id }, _set: $set) { id code name active sort_order }
    }`,
    { id, set }
  );
  return data[`update_${table}_by_pk`];
}

async function fetchTaxonomyAdmin() {
  return adminGql(`
    query TaxonomyAdmin {
      catalog_muscle_groups(order_by: { sort_order: asc, code: asc }) {
        id code name sort_order active
        group_muscles { role muscle { id code name active } }
        group_movement_types { movement_type { id code name active } }
      }
      catalog_muscles(order_by: { code: asc }) { id code name sort_order active }
      catalog_movement_types(order_by: { sort_order: asc, code: asc }) { id code name sort_order active }
      catalog_equipment(order_by: { sort_order: asc, code: asc }) { id code name sort_order active }
      catalog_variations(order_by: { sort_order: asc, code: asc }) { id code name sort_order active }
      catalog_positions(order_by: { sort_order: asc, code: asc }) { id code name sort_order active }
      catalog_grips(order_by: { sort_order: asc, code: asc }) { id code name sort_order active }
      catalog_load_modalities(order_by: { sort_order: asc, code: asc }) { id code name sort_order active }
      catalog_logging_modes(order_by: { sort_order: asc, code: asc }) { id code name sort_order active }
    }
  `);
}

module.exports = {
  ensureLookup,
  nextXcatExoId,
  composeXcatExercise,
  composeCustomXcatExercise,
  listAuthUsers,
  listXcatLibraryAdmin,
  updateXcatExercise,
  deactivateXcatExercise,
  upsertLookup,
  manageRelation,
  updateLookup,
  fetchTaxonomyAdmin,
};
