import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
	...nextVitals,
	...nextTs,
	prettier,
	{
		rules: {
			// Intentional: closing the image viewer / the video player when their entry
			// leaves the listing, and the browse fetch when the dialog opens.
			"react-hooks/set-state-in-effect": "warn",
		},
	},
	// Override default ignores of eslint-config-next.
	globalIgnores([
		// Default ignores of eslint-config-next:
		".next/**",
		"out/**",
		"build/**",
		"next-env.d.ts",
		// Project specific:
		"node_modules/**",
		"media/**",
		"data/**",
		"public/**",
		"drizzle/**",
	]),
]);

export default eslintConfig;
