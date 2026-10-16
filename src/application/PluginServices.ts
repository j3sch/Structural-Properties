import type { PluginSettings } from '../domain/plugin-data';
import { DiffEngine } from '../domain/core/DiffEngine';
import { Formatter } from '../domain/core/Formatter';
import { RuleEngine } from '../domain/core/RuleEngine';
import type { FrontmatterRepository } from '../ports/FrontmatterRepository';
import type { LinkGenerator } from '../ports/LinkGenerator';
import type { VaultAccess } from '../ports/VaultAccess';
import { createDefaultRegistry } from '../resolvers';
import type { ManagedStateStore } from '../domain/ManagedStateStore';
import { MaintenanceService } from './MaintenanceService';
import { ProcessingService } from './ProcessingService';
import { RuleService } from './RuleService';

export interface PluginServices {
	processing: ProcessingService;
	rules: RuleService;
	maintenance: MaintenanceService;
}

export function createPluginServices(dependencies: {
	frontmatter: FrontmatterRepository;
	vault: VaultAccess;
	linkGenerator: LinkGenerator;
	getSettings: () => PluginSettings;
	managedState: ManagedStateStore;
	persist: () => Promise<void>;
}): PluginServices {
	const engine = new RuleEngine(
		createDefaultRegistry(),
		new Formatter(dependencies.linkGenerator),
		new DiffEngine(),
	);
	return {
		processing: new ProcessingService(
			engine,
			dependencies.frontmatter,
			dependencies.vault,
			dependencies.linkGenerator,
			dependencies.getSettings,
			dependencies.managedState,
			dependencies.persist,
		),
		rules: new RuleService(
			dependencies.getSettings,
			dependencies.managedState,
			dependencies.persist,
		),
		maintenance: new MaintenanceService(
			dependencies.vault,
			dependencies.managedState,
			dependencies.persist,
		),
	};
}
