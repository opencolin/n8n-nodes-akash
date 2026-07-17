import type { IExecuteFunctions } from 'n8n-workflow';

/** Valid persistent-storage classes (`docs/research/sdl-and-tx-flow.md` §1e). */
const VALID_STORAGE_CLASSES = new Set(['beta1', 'beta2', 'beta3', 'ram']);

/** Valid GPU interfaces — only `pcie` or `sxm` (never `sxm4`) (`sdl-and-tx-flow.md` §1d). */
const VALID_GPU_INTERFACES = new Set(['pcie', 'sxm']);

/** Max storage volumes per compute profile (one ephemeral + one optional persistent). */
const MAX_STORAGE_VOLUMES = 2;

/**
 * Read an SDL YAML document from the node, as a **plain string** — the zero-dep ingest path.
 *
 * SDL is passed to Console verbatim (Console signs server-side and computes the manifest hash);
 * the node therefore does **NO YAML parse, NO manifest hash, NO protobuf** — it just resolves the
 * text. Two sources, chosen by the `sdlSource` param:
 *
 *   - `binary` — read the uploaded `deploy.yaml` from the binary property named by
 *     `sdlBinaryProperty` (default `data`) and decode it as UTF-8.
 *   - `string` — return the `sdl` expression string exactly as authored.
 *
 * @param itemIndex The current input item index.
 * @returns The SDL YAML as a UTF-8 string, byte-for-byte as supplied.
 */
export async function resolveSdl(this: IExecuteFunctions, itemIndex: number): Promise<string> {
	const source = this.getNodeParameter('sdlSource', itemIndex, 'string') as string;

	if (source === 'binary') {
		const binaryPropertyName = this.getNodeParameter(
			'sdlBinaryProperty',
			itemIndex,
			'data',
		) as string;
		const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
		return buffer.toString('utf8');
	}

	return this.getNodeParameter('sdl', itemIndex, '') as string;
}

/** Leading-whitespace width of a line (SDL is indentation-structured YAML). */
function indentOf(line: string): number {
	const match = line.match(/^(\s*)/);
	return match ? match[1].length : 0;
}

/**
 * Count the immediate list-item volumes under each list-form `storage:` block. Only counts the
 * top-level `- …` items of each block (nested attributes like `attributes:`/`persistent:` sit
 * deeper and are skipped). Inline `storage: { … }` forms are not list-counted. Returns one count
 * per `storage:` block found.
 */
function countStorageVolumes(lines: string[]): number[] {
	const counts: number[] = [];

	for (let i = 0; i < lines.length; i++) {
		if (!/^\s*storage\s*:\s*$/.test(lines[i])) {
			continue;
		}
		const storageIndent = indentOf(lines[i]);
		let itemIndent = -1;
		let count = 0;

		for (let j = i + 1; j < lines.length; j++) {
			if (lines[j].trim() === '') {
				continue;
			}
			const ind = indentOf(lines[j]);
			if (ind <= storageIndent) {
				break; // dedent — end of this storage block
			}
			if (/^\s*-\s+/.test(lines[j])) {
				if (itemIndent === -1) {
					itemIndent = ind;
				}
				if (ind === itemIndent) {
					count++;
				}
			}
		}

		if (count > 0) {
			counts.push(count);
		}
	}

	return counts;
}

/**
 * Detect whether a `class: ram` volume is (incorrectly) marked `persistent: true`. Walks the list
 * item bracketing each `class: ram` line (backward to its `- ` start, forward to the next sibling
 * `- ` or dedent) looking for `persistent: true` in the same item. Also catches the inline
 * `{ persistent: true, class: ram }` single-line form.
 */
function hasPersistentRam(lines: string[]): boolean {
	// Inline object form on a single line.
	for (const line of lines) {
		if (/class\s*:\s*["']?ram["']?/i.test(line) && /persistent\s*:\s*true/i.test(line)) {
			return true;
		}
	}

	// Block form: `class: ram` on its own line, `persistent: true` elsewhere in the same item.
	for (let i = 0; i < lines.length; i++) {
		if (!/^\s*class\s*:\s*["']?ram["']?\s*$/i.test(lines[i])) {
			continue;
		}
		const classIndent = indentOf(lines[i]);

		// Backward to the item's opening `- ` (or its parent key).
		for (let j = i - 1; j >= 0; j--) {
			if (lines[j].trim() === '') {
				continue;
			}
			if (/persistent\s*:\s*true/i.test(lines[j])) {
				return true;
			}
			const ind = indentOf(lines[j]);
			if (/^\s*-\s+/.test(lines[j]) && ind <= classIndent) {
				break; // reached the start of this list item
			}
			if (ind < classIndent && !/^\s*-\s+/.test(lines[j])) {
				break; // dedented to a parent key
			}
		}

		// Forward to the next sibling item or a dedent.
		for (let j = i + 1; j < lines.length; j++) {
			if (lines[j].trim() === '') {
				continue;
			}
			const ind = indentOf(lines[j]);
			if (/^\s*-\s+/.test(lines[j]) && ind <= classIndent) {
				break; // next sibling volume
			}
			if (ind < classIndent) {
				break; // dedent to parent
			}
			if (/persistent\s*:\s*true/i.test(lines[j])) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Best-effort, zero-dep **shape lint** for an SDL string. Pure textual/indentation heuristics — it
 * never parses YAML and **never throws**; on any internal error it returns whatever warnings it has
 * gathered. It is advisory only (Console remains the authority): the caller surfaces the warnings
 * but does not block on them.
 *
 * Checks (per `docs/research/sdl-and-tx-flow.md` §1):
 *   - required top-level sections `services`, `profiles`, `deployment` are present;
 *   - `profiles.compute` and `profiles.placement` blocks are present;
 *   - GPU `interface` values are `pcie` or `sxm` only;
 *   - persistent-storage `class` values are `beta1|beta2|beta3|ram`;
 *   - each `storage:` list has at most two volumes;
 *   - a `ram` (SHM) volume is never marked `persistent`.
 *
 * @param sdl The SDL YAML text (as returned by {@link resolveSdl}).
 * @returns `{ warnings }` — an empty array means no shape problems were detected.
 */
export function lintSdlShape(sdl: string): { warnings: string[] } {
	const warnings: string[] = [];

	try {
		if (typeof sdl !== 'string' || sdl.trim() === '') {
			return { warnings: ['SDL is empty.'] };
		}

		const lines = sdl.split(/\r?\n/);

		const hasTopLevel = (name: string): boolean =>
			lines.some((line) => new RegExp(`^${name}\\s*:`).test(line));
		const hasIndentedKey = (name: string): boolean =>
			lines.some((line) => new RegExp(`^\\s+${name}\\s*:`).test(line));

		if (!hasTopLevel('services')) {
			warnings.push('Missing top-level `services:` section.');
		}
		if (!hasTopLevel('profiles')) {
			warnings.push('Missing top-level `profiles:` section.');
		}
		if (!hasTopLevel('deployment')) {
			warnings.push('Missing top-level `deployment:` section.');
		}
		if (!hasIndentedKey('compute')) {
			warnings.push('Missing `profiles.compute` block.');
		}
		if (!hasIndentedKey('placement')) {
			warnings.push('Missing `profiles.placement` block.');
		}

		// GPU interface must be pcie or sxm (scan every `interface:` occurrence).
		const interfaceRe = /interface\s*:\s*["']?([A-Za-z0-9]+)["']?/gi;
		let interfaceMatch: RegExpExecArray | null;
		while ((interfaceMatch = interfaceRe.exec(sdl)) !== null) {
			const iface = interfaceMatch[1].toLowerCase();
			if (!VALID_GPU_INTERFACES.has(iface)) {
				warnings.push(`GPU interface \`${interfaceMatch[1]}\` is invalid (expected pcie or sxm).`);
			}
		}

		// Storage class must be beta1|beta2|beta3|ram (scan every `class:` occurrence).
		const classRe = /class\s*:\s*["']?([A-Za-z0-9]+)["']?/gi;
		let classMatch: RegExpExecArray | null;
		while ((classMatch = classRe.exec(sdl)) !== null) {
			const cls = classMatch[1].toLowerCase();
			if (!VALID_STORAGE_CLASSES.has(cls)) {
				warnings.push(
					`Storage class \`${classMatch[1]}\` is invalid (expected beta1|beta2|beta3|ram).`,
				);
			}
		}

		for (const count of countStorageVolumes(lines)) {
			if (count > MAX_STORAGE_VOLUMES) {
				warnings.push(`A storage profile lists ${count} volumes (max ${MAX_STORAGE_VOLUMES}).`);
			}
		}

		if (hasPersistentRam(lines)) {
			warnings.push('A `ram` (SHM) storage volume must not be `persistent`.');
		}
	} catch {
		// Best-effort: never throw — return whatever was gathered.
		return { warnings: dedupe(warnings) };
	}

	return { warnings: dedupe(warnings) };
}

/** De-duplicate warnings while preserving first-seen order. */
function dedupe(warnings: string[]): string[] {
	return Array.from(new Set(warnings));
}
