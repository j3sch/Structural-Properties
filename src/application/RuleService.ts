import type { PluginSettings } from '../domain/plugin-data';
import type { StructuralRule } from '../domain/rules';
import type { ManagedStateStore } from '../domain/ManagedStateStore';
import { validateRule } from '../settings';

export class RuleService {
	constructor(
		private getSettings: () => PluginSettings,
		private managedState: ManagedStateStore,
		private persist: () => Promise<void>,
	) {}

	async addRule(rule: StructuralRule): Promise<void> {
		this.assertValid(rule);
		this.getSettings().rules.push(rule);
		await this.persist();
	}

	async updateRule(rule: StructuralRule): Promise<void> {
		this.assertValid(rule);
		const index = this.getSettings().rules.findIndex((candidate) => candidate.id === rule.id);
		if (index < 0) throw new Error(`Rule not found: ${rule.id}`);
		this.getSettings().rules[index] = rule;
		await this.persist();
	}

	async setEnabled(ruleId: string, enabled: boolean): Promise<void> {
		const rule = this.getSettings().rules.find((candidate) => candidate.id === ruleId);
		if (!rule) throw new Error(`Rule not found: ${ruleId}`);
		rule.enabled = enabled;
		await this.persist();
	}

	async deleteRule(ruleId: string): Promise<void> {
		const settings = this.getSettings();
		settings.rules = settings.rules.filter((rule) => rule.id !== ruleId);
		this.managedState.removeRule(ruleId);
		await this.persist();
	}

	private assertValid(rule: StructuralRule): void {
		const errors = validateRule(rule);
		if (errors.length > 0) throw new Error(errors.join(' '));
	}
}
