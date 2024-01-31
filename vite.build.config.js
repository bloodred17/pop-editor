import { defineConfig } from "vite";
import topLevelAwait from "vite-plugin-top-level-await";
import tsconfig from 'vite-plugin-tsconfig';
import dts from 'vite-plugin-dts';


export default defineConfig({
  plugins: [
    topLevelAwait(),
    tsconfig({ filename: 'tsconfig.build.json' }),
    dts({ rollupTypes: true }) 
  ],
  build: {
    lib: {
      entry: 'src/pop-editor.ts',
      formats: ['es'],
      fileName: 'pdfx'
    }
  }
})