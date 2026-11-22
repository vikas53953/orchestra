// Deny every web permission (camera, mic, notifications, geolocation, ...). Spec: architecture.md §10. Owner: T3.
import type { Session } from 'electron';

export function denyAllPermissions(s: Pick<Session, 'setPermissionRequestHandler' | 'setPermissionCheckHandler'>): void {
  s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  s.setPermissionCheckHandler(() => false);
}
