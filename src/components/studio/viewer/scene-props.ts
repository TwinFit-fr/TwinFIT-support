// Props of the r3f scene and what it reports about the loaded model.
import type { AvatarSocket } from "@/lib/studio/types";
import type { LoadedClip } from "./movement-clip";

export type SceneProps = {
  avatarId: string | null;
  modelUrl: string | null;
  heightM: number | null;
  sockets: AvatarSocket[];
  clip: LoadedClip | null;
  onModelInfo?: (info: ModelInfo | null) => void;
  /** Loading progress of the model (0-100) while a load is in flight, null when idle. */
  onProgress?: (progress: number | null) => void;
  /** The model failed to load (message), or loads again (null). */
  onError?: (message: string | null) => void;
  /** A pose clip could not be solved on this rig. */
  onClipError?: (message: string) => void;
};

export type ModelInfo = {
  bones: number;
  meshes: number;
  animations: string[];
  heightM: number;
  missingSockets: string[];
};
