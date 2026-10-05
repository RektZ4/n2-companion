export function errorMessage(error) {
  return error?.message || String(error);
}
