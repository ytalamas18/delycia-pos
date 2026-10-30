/** Props comunes de los campos de PIN (4 dígitos, oculto, teclado numérico). */
export const pinInputProps = {
  type: "password",
  inputMode: "numeric",
  pattern: "\\d{4}",
  maxLength: 4,
  required: true,
  autoComplete: "off",
  className: "w-28",
} as const;
