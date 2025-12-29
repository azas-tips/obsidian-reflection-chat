import type { CoachCharacter } from '../types';
import { getTranslations } from '../i18n';

/**
 * Get all preset coach characters
 */
export function getPresetCharacters(): CoachCharacter[] {
	const t = getTranslations();

	return [
		{
			id: 'carl',
			name: t.coach.presets.carl.name,
			tone: 'friendly',
			strictness: 'gentle',
			personalityPrompt: t.coach.presets.carl.personality,
			isPreset: true,
		},
		{
			id: 'al',
			name: t.coach.presets.al.name,
			tone: 'friendly',
			strictness: 'balanced',
			personalityPrompt: t.coach.presets.al.personality,
			isPreset: true,
		},
		{
			id: 'viktor',
			name: t.coach.presets.viktor.name,
			tone: 'formal',
			strictness: 'balanced',
			personalityPrompt: t.coach.presets.viktor.personality,
			isPreset: true,
		},
		{
			id: 'jung',
			name: t.coach.presets.jung.name,
			tone: 'formal',
			strictness: 'balanced',
			personalityPrompt: t.coach.presets.jung.personality,
			isPreset: true,
		},
		{
			id: 'hayao',
			name: t.coach.presets.hayao.name,
			tone: 'friendly',
			strictness: 'gentle',
			personalityPrompt: t.coach.presets.hayao.personality,
			isPreset: true,
		},
		{
			id: 'marshall',
			name: t.coach.presets.marshall.name,
			tone: 'casual',
			strictness: 'strict',
			personalityPrompt: t.coach.presets.marshall.personality,
			isPreset: true,
		},
	];
}

/**
 * Get a character by ID (preset or custom)
 */
export function getCharacterById(
	id: string,
	customCharacters: CoachCharacter[]
): CoachCharacter | undefined {
	// First check presets
	const presets = getPresetCharacters();
	const preset = presets.find((c) => c.id === id);
	if (preset) return preset;

	// Then check custom characters
	return customCharacters.find((c) => c.id === id);
}

/**
 * Build the character prompt addition to system prompt
 */
export function buildCharacterPrompt(character: CoachCharacter): string {
	const t = getTranslations();

	const tonePrompt = t.coach.tonePrompts[character.tone];
	const strictnessPrompt = t.coach.strictnessPrompts[character.strictness];
	const tmpl = t.coach.promptTemplate;

	return `
## ${tmpl.header}
${tmpl.nameIntro.replace('{name}', character.name)}

### ${tmpl.toneHeader}
${tonePrompt}

### ${tmpl.attitudeHeader}
${strictnessPrompt}

### ${tmpl.personalityHeader}
${character.personalityPrompt}
`.trim();
}

/**
 * Generate a unique ID for custom characters
 */
export function generateCustomCharacterId(): string {
	return `custom_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
