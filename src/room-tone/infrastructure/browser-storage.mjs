export const browserStorage = {
  read: key => JSON.parse(localStorage.getItem(key) || "null"),
  write: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
  remove: key => localStorage.removeItem(key),
};
