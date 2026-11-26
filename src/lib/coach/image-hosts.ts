import { optionalNhostUrl } from "@/lib/nhost/urls";

const storageUrl = optionalNhostUrl("storage");

/** The app draws images from its own Storage only (`imageHosts` in CoachHost.kt); previews do the same. */
export const APP_IMAGE_HOSTS: readonly string[] = storageUrl ? [new URL(storageUrl).host] : [];
