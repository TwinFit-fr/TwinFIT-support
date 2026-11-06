/**
 * GraphQL documents of the 3D Studio (Hasura, role staff). Kept as plain strings so the server
 * routes and tests share one source. Field lists are the columns the UI reads, nothing more.
 */

export const AVATAR_FIELDS = `
  id code name subject file_id model_url rig height_m sockets params active is_default
  inserted_at updated_at
`;

export const VECTOR_FIELDS = `
  id seq exercise_id avatar_id prompt equipment params status attempts max_attempts not_before
  error file_id vector_url format fps frame_count duration_ms model usage active created_by
  inserted_at started_at finished_at updated_at
  avatar { id code subject }
`;

/**
 * The catalog for the sidebar in one round trip:
 * - active exercises with the taxonomy the list and the prompt need (one localized description),
 * - the Start frame of the default style (man) as thumbnail,
 * - the state of every movement vector (3 columns) for the per-exercise counters.
 * The catalog metadata has no relationship to animation_studio (the schema stays isolated), so
 * the two extra roots are joined in the route by exo_id / exercise_id.
 */
export const STUDIO_CATALOG = `
  query StudioCatalog {
    catalog_exercises(where: { active: { _eq: true } }, order_by: { exo_id: asc }) {
      id exo_id display_name
      primary_muscle_group { code name }
      target_muscle { code name }
      movement_type { code name }
      equipment { code name }
      support_equipment { code name }
      localizations(where: { locale: { _eq: "en" } }, limit: 1) { description }
    }
    images_exercise_images(
      where: {
        active: { _eq: true }
        position: { _eq: 0 }
        subject: { _eq: "man" }
        style: { is_default: { _eq: true } }
      }
    ) { exo_id image_url }
    animation_studio_movement_vectors { exercise_id status active }
  }
`;

export const STUDIO_AVATARS = `
  query StudioAvatars {
    animation_studio_base_avatars(order_by: [{ is_default: desc }, { name: asc }]) { ${AVATAR_FIELDS} }
  }
`;

export const STUDIO_CREATE_AVATAR = `
  mutation StudioCreateAvatar($object: animation_studio_base_avatars_insert_input!) {
    insert_animation_studio_base_avatars_one(object: $object) { ${AVATAR_FIELDS} }
  }
`;

/**
 * Same, for a new default: the partial unique index base_avatars_default_key allows one default,
 * so the current one is cleared first; Hasura runs the two root fields in order in one transaction.
 */
export const STUDIO_CREATE_DEFAULT_AVATAR = `
  mutation StudioCreateDefaultAvatar($object: animation_studio_base_avatars_insert_input!) {
    clear: update_animation_studio_base_avatars(where: { is_default: { _eq: true } }, _set: { is_default: false }) {
      affected_rows
    }
    insert_animation_studio_base_avatars_one(object: $object) { ${AVATAR_FIELDS} }
  }
`;

export const STUDIO_SETTINGS = `
  query StudioSettings {
    animation_studio_settings(limit: 1) {
      max_concurrency stale_after_minutes pipeline prompt_template updated_at
    }
  }
`;

/** Newest first; the history of one exercise is short, 100 covers every run with room to spare. */
export const STUDIO_VECTORS = `
  query StudioVectors($exerciseId: uuid!) {
    animation_studio_movement_vectors(
      where: { exercise_id: { _eq: $exerciseId } }
      order_by: { seq: desc }
      limit: 100
    ) { ${VECTOR_FIELDS} }
  }
`;

export const STUDIO_VECTOR = `
  query StudioVector($id: uuid!) {
    animation_studio_movement_vectors_by_pk(id: $id) { ${VECTOR_FIELDS} }
  }
`;

/** Enqueue: the row starts pending; the trigger fills params from settings when they are empty. */
export const STUDIO_ENQUEUE = `
  mutation StudioEnqueue($object: animation_studio_movement_vectors_insert_input!) {
    insert_animation_studio_movement_vectors_one(object: $object) { ${VECTOR_FIELDS} }
  }
`;

/** Generic column update (status, result columns, prompt edits). */
export const STUDIO_UPDATE_VECTOR = `
  mutation StudioUpdateVector($id: uuid!, $set: animation_studio_movement_vectors_set_input!) {
    update_animation_studio_movement_vectors_by_pk(pk_columns: { id: $id }, _set: $set) { ${VECTOR_FIELDS} }
  }
`;

/**
 * Make one clip the playable one of its (exercise, avatar): the sibling that was active is
 * cleared first, then the target is set, in one Hasura transaction (mutations run in order), so
 * the partial unique index movement_vectors_active_key never sees two active rows.
 */
export const STUDIO_ACTIVATE_VECTOR = `
  mutation StudioActivateVector($id: uuid!, $exerciseId: uuid!, $avatarId: uuid!) {
    clear: update_animation_studio_movement_vectors(
      where: {
        exercise_id: { _eq: $exerciseId }
        avatar_id: { _eq: $avatarId }
        active: { _eq: true }
        id: { _neq: $id }
      }
      _set: { active: false }
    ) { affected_rows }
    set: update_animation_studio_movement_vectors_by_pk(
      pk_columns: { id: $id }
      _set: { active: true }
    ) { ${VECTOR_FIELDS} }
  }
`;

/** Hasura only lets staff delete rows that are not active (permission filter). */
export const STUDIO_DELETE_VECTOR = `
  mutation StudioDeleteVector($id: uuid!) {
    delete_animation_studio_movement_vectors_by_pk(id: $id) { id file_id }
  }
`;

/** Worker entry point (the pipeline calls it; exposed here for completeness and tests). */
export const STUDIO_CLAIM = `
  mutation StudioClaim {
    animation_studio_claim_movement_vector { ${VECTOR_FIELDS} }
  }
`;
