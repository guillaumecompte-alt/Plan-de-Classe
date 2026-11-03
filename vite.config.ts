import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  // Chemins relatifs : le site fonctionne aussi bien à la racine d'un domaine
  // que dans un sous-dossier (GitHub Pages : https://<compte>.github.io/Plan-de-Classe/).
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
