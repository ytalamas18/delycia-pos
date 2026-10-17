/** Next.js llama a register() una sola vez al arrancar el servidor. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrap } = await import("./config/bootstrap");
    bootstrap();
  }
}
