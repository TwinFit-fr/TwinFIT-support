/** The app draws images from its own Storage only (`imageHosts` in CoachHost.kt); previews do the same. */
export const APP_IMAGE_HOSTS: readonly string[] =
  process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN && process.env.NEXT_PUBLIC_NHOST_REGION
    ? [`${process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN}.storage.${process.env.NEXT_PUBLIC_NHOST_REGION}.nhost.run`]
    : [];
