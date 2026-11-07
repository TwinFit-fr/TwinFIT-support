/**
 * Range of motion of every joint, from the anatomical position, with where each number comes from
 * (full references: docs/studio-biomechanics-audit-2026-11-07.md, section 7). `hard` is what a body
 * can do: sliders, the limb solver and the sanitiser stop there. `training` is the envelope of
 * normal gym work: the validator warns outside it, nothing stops you.
 *
 * Sources: RA Roaas & Andersson 1982 (with its AAOS 1965 and Boone-Azen columns); CDC Soucie 2011;
 * UK shoulder literature review; KAS Kasahara 2024; LUD Ludewig 2009; IKU 2023 normative spine
 * study; INS inertial spine study; RYU Ryu 1991. "product" marks a rule of ours, not a measurement;
 * "unconfirmed" a value the audit could not trace to an accessible source.
 */

export type JointRange = {
  hard: [number, number];
  training: [number, number];
  source: string;
};

export const ROM: Record<string, JointRange> = {
  // Humerus against the thorax, ISB order: plane of elevation (0 to the side, 90 forward, -90
  // behind), elevation in that plane, then rotation about the humerus.
  "arm.shoulder_plane": { hard: [-90, 140], training: [-90, 130], source: "unconfirmed; -90 is extension, 130 cross-body" },
  "arm.shoulder_elevation": { hard: [0, 180], training: [0, 175], source: "UK abduction 171 (117-189); CDC flexion 164-172; extension 54 (28-80) checked by the validator" },
  "arm.shoulder_rotation": { hard: [-75, 90], training: [-75, 90], source: "UK IR 74 (30-110), ER 83 (40-117)" },
  "arm.scapula_protraction": { hard: [-20, 20], training: [-20, 20], source: "LUD clavicle retraction +16; protraction unconfirmed" },
  "arm.scapula_elevation": { hard: [-10, 30], training: [-10, 30], source: "LUD clavicle elevation +6 in arm raising; a shrug beyond it unconfirmed" },
  "arm.elbow_flexion": { hard: [-5, 150], training: [0, 145], source: "CDC flexion 143.5-150, extension 0 to 4.7" },
  "arm.forearm_pronation": { hard: [0, 170], training: [0, 170], source: "CDC pronation 77-82 and supination 82-91, from full supination" },
  "arm.wrist_flexion": { hard: [-65, 75], training: [-65, 60], source: "goniometry flexion 74, extension 66; RYU task maximum 54 / 60" },
  "arm.wrist_deviation": { hard: [-30, 20], training: [-30, 20], source: "ulnar 30, radial 20, goniometry snippets" },
  "leg.hip_flexion": { hard: [-15, 130], training: [-10, 125], source: "RA 120 (90-150), CDC 127-134; extension RA 9.5, CDC 13.5-18" },
  "leg.hip_abduction": { hard: [-30, 45], training: [-30, 45], source: "RA abduction 38.5, AAOS 48; adduction 30.5, AAOS 31" },
  "leg.hip_rotation": { hard: [-35, 45], training: [-30, 30], source: "RA IR 32.5, ER 33.6; AAOS IR 35, ER 48" },
  "leg.knee_flexion": { hard: [-5, 145], training: [0, 140], source: "RA 143.7 (115-160), CDC 133-142" },
  "leg.ankle_dorsiflexion": { hard: [-50, 40], training: [-50, 35], source: "PF RA 39.6, AAOS 48; DF 12-18 open chain, 33-39 loaded, KAS squat 32.8" },
  "leg.ankle_inversion": { hard: [-28, 28], training: [-20, 20], source: "RA 27.7 / 27.7; training product" },
  "lumbar.flexion": { hard: [-25, 55], training: [-15, 30], source: "INS lumbar 55 / 23; training product: loaded lifts stay near neutral" },
  "lumbar.lateral": { hard: [-20, 20], training: [-20, 20], source: "Neumann excerpt, about 20 per side" },
  "lumbar.twist": { hard: [-8, 8], training: [-8, 8], source: "INS" },
  "thoracic.flexion": { hard: [-12, 20], training: [-12, 20], source: "INS thoracic 20 / 12" },
  "thoracic.lateral": { hard: [-15, 15], training: [-15, 15], source: "unconfirmed; total lateral 36 (IKU) less lumbar" },
  "thoracic.twist": { hard: [-30, 30], training: [-30, 30], source: "unconfirmed; total rotation 38 (IKU) less lumbar" },
  "head.pitch": { hard: [-59, 58], training: [-59, 58], source: "IKU flexion 58, extension 59" },
  "head.yaw": { hard: [-70, 70], training: [-70, 70], source: "IKU 70-71" },
  "head.lateral": { hard: [-41, 41], training: [-41, 41], source: "IKU" },
};

/** Position of the body and props: not joints, so no anatomy behind them. */
export const ROOT_LIMITS: Record<string, { min: number; max: number }> = {
  "hips.pitch": { min: -180, max: 180 },
  "hips.yaw": { min: -180, max: 180 },
  "hips.roll": { min: -90, max: 90 },
  "hips.forward_m": { min: -0.6, max: 0.6 },
  "hips.height_m": { min: 0.05, max: 2.2 },
  "implement.height_m": { min: 0, max: 2.6 },
  "implement.forward_m": { min: -0.6, max: 1.0 },
  "implement.grip_width_m": { min: 0.05, max: 1.4 },
};
