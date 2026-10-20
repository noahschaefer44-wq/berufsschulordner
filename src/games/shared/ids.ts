/** Kurze zufällige Kennung (für gespeicherte Einträge). */
export const newId = () => Math.random().toString(36).slice(2, 10);
