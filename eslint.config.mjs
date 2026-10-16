import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Fronteras del monolito modular:
    // desde fuera de un módulo solo se puede importar su API pública (modules/<x>/index.ts).
    // Dentro de un módulo, sus propios archivos se importan con rutas relativas.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*/*", "**/modules/*/*"],
              message: "Importa solo la API pública del módulo: '@/modules/<modulo>'.",
            },
          ],
        },
      ],
    },
  },
  {
    // `core` es el núcleo compartido: no puede depender de ningún módulo ni de la composición.
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/modules/**", "**/modules/**"], message: "core no puede importar módulos." },
            { group: ["@/config/**", "@/app/**"], message: "core no puede depender de la app." },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**"]),
]);

export default eslintConfig;
