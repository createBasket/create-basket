export const generateStartCode = (): string => {
  const random = crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
  return random.replace(/-/g, '').slice(0, 8).toUpperCase();
};
