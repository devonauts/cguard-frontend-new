/**
 * The YAML on screen hides the passwords in the stream URLs
 * (`rtsp://user:••••@host`): the dialog showed the DVR password in clear to
 * anyone looking at the screen. «Copiar» still copies the real config, which
 * go2rtc needs to log in to the recorder.
 */
export function maskStreamPasswords(text: string): string {
  return String(text || "").replace(
    /([a-z][a-z0-9+.-]*:\/\/[^:/\s@]+):[^@\s]+@/gi,
    "$1:••••@",
  );
}
