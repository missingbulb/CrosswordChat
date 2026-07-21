// The four manifest keys that request store-reviewed capabilities. The store
// wants a written justification for every one (required and optional alike),
// and the privacy policy must disclose what each accesses — so both the
// privacy-alignment and permission-added checks read the same set.
export const PERMISSION_KEYS = [
  'permissions',
  'host_permissions',
  'optional_permissions',
  'optional_host_permissions',
];

export function requestedPermissions(manifest) {
  return PERMISSION_KEYS.flatMap((k) => (Array.isArray(manifest[k]) ? manifest[k] : []));
}
