export function erreur(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
