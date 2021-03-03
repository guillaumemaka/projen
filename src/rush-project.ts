import * as path from 'path';
import * as fs from 'fs-extra';
import { JsonFile } from './json';
import { NodePackageManager } from './node-package';
import { NodeProject, NodeProjectOptions } from './node-project';
import { Project as BaseProject } from './project';
import { Task } from './tasks/task';

/* eslint-disable @typescript-eslint/no-shadow */

//#region Interfaces

/**
 * This configuration file defines a deployment scenario for use with the "rush deploy"
 * command. The default scenario file path is "deploy.json"; additional files use the naming
 * pattern "deploy-<scenario-name>.json". For full documentation, please see
 * https://rushjs.io
 */
export interface RushCommonDeployConfig {
  /**
   * Part of the JSON Schema standard, this optional keyword declares the URL of the schema
   * that the file conforms to. Editors may download the schema and use it to perform syntax
   * highlighting.
   */
  readonly $schema?: 'https://developer.microsoft.com/json-schemas/rush/v5/deploy-scenario.schema.json';
  /**
   * The "rush deploy" command prepares a deployment folder, starting from the main project
   * and collecting all of its dependencies (both NPM packages and other Rush projects).  The
   * main project is specified using the "--project" parameter.  The "deploymentProjectNames"
   * setting lists the allowable choices for the "--project" parameter; this documents the
   * intended deployments for your monorepo and helps validate that "rush deploy" is invoked
   * correctly.  If there is only one item in the "deploymentProjectNames" array, then
   * "--project" can be omitted.  The names should be complete package names as declared in
   * rush.json.
   *
   * If the main project should include other unrelated Rush projects, add it to the
   * "projectSettings" section, and then specify those projects in the
   * "additionalProjectsToInclude" list.
   */
  deploymentProjectNames: string[];
  /**
   * If this path is specified, then after "rush deploy", recursively copy the files from this
   * folder to the deployment target folder (common/deploy). This can be used to provide
   * additional configuration files or scripts needed by the server when deploying. The path
   * is resolved relative to the repository root.
   */
  folderToCopy?: string;
  /**
   * When deploying a local Rush project, the package.json "devDependencies" are normally
   * excluded. If you want to include them, set "includeDevDependencies" to true. The default
   * value is false.
   */
  includeDevDependencies?: boolean;
  /**
   * When deploying a local Rush project, normally the .npmignore filter is applied so that
   * Rush only copies files that would be packaged by "npm pack".  Setting
   * "includeNpmIgnoreFiles" to true will disable this filtering so that all files are copied
   * (with a few trivial exceptions such as the "node_modules" folder). The default value is
   * false.
   */
  includeNpmIgnoreFiles?: boolean;
  /**
   * Specify how links (symbolic links, hard links, and/or NTFS junctions) will be created in
   * the deployed folder:
   * "default": Create the links while copying the files; this is the default behavior.
   * "script": A Node.js script called "create-links.js" will be written.  When executed, this
   * script will create the links described in the "deploy-metadata.json" output file.
   * "none": Do nothing; some other tool may create the links later.
   */
  linkCreation?: LinkCreation;
  /**
   * To improve backwards compatibility with legacy packages, the PNPM package manager
   * installs extra links in the node_modules folder that enable packages to import undeclared
   * dependencies.  In some cases this workaround may significantly increase the installation
   * footprint or cause other problems.  If your deployment does not require this workaround,
   * you can set "omitPnpmWorkaroundLinks" to true to avoid creating the extra links.  The
   * default value is false.
   */
  omitPnpmWorkaroundLinks?: boolean;
  /**
   * Customize how Rush projects are processed during deployment.
   */
  projectSettings?: ProjectSetting[];
}

/**
* Specify how links (symbolic links, hard links, and/or NTFS junctions) will be created in
* the deployed folder:
* "default": Create the links while copying the files; this is the default behavior.
* "script": A Node.js script called "create-links.js" will be written.  When executed, this
* script will create the links described in the "deploy-metadata.json" output file.
* "none": Do nothing; some other tool may create the links later.
*/
export enum LinkCreation {
  Default = 'default',
  None = 'none',
  Script = 'script',
}

export interface ProjectSetting {
  /**
   * When deploying a project, the included dependencies are normally determined automatically
   * based on package.json fields such as 'dependencies', 'peerDependencies', and
   * 'optionalDependencies', subject to other deployment settings such as
   * 'includeDevDependencies'. However, in cases where that information is not accurate, you
   * can use 'additionalDependenciesToInclude' to add more packages to the list.
   */
  additionalDependenciesToInclude?: string[];
  /**
   * A list of additional local Rush projects to be deployed with this project (beyond the
   * package.json dependencies).  Specify full package names, which must be declared in
   * rush.json.
   */
  additionalProjectsToInclude?: string[];
  /**
   * This setting prevents specific dependencies from being deployed.  It only filters
   * dependencies that are explicitly declared in package.json for this project.  It does not
   * affect dependencies added via 'additionalProjectsToInclude' or
   * 'additionalDependenciesToInclude', nor does it affect indirect dependencies.
   */
  dependenciesToExclude?: string[];
  /**
   * The full package name of the project, which must be declared in rush.json.
   */
  projectName: string;
}

/**
 * For use with the Rush tool, this file allows repo maintainers to enable and disable
 * experimental Rush features.
 */
export interface RushCommonExperimentsConfig {
  /**
   * Part of the JSON Schema standard, this optional keyword declares the URL of the schema
   * that the file conforms to. Editors may download the schema and use it to perform syntax
   * highlighting.
   */
  readonly $schema?: 'https://developer.microsoft.com/json-schemas/rush/v5/experiments.schema.json';
  /**
   * If true, the build cache feature is enabled. To use this feature, a
   * common/config/rush/build-cache.json file must be created with configuration options.
   */
  buildCache?: boolean;
  /**
   * Rush 5.14.0 improved incremental builds to ignore spurious changes in the pnpm-lock.json
   * file. This optimization is enabled by default. If you encounter a problem where "rush
   * build" is neglecting to build some projects, please open a GitHub issue. As a workaround
   * you can uncomment this line to temporarily restore the old behavior where everything must
   * be rebuilt whenever pnpm-lock.json is modified.
   */
  legacyIncrementalBuildDependencyDetection?: boolean;
  /**
   * If true, the chmod field in temporary project tar headers will not be normalized. This
   * normalization can help ensure consistent tarball integrity across platforms.
   */
  noChmodFieldInTarHeaderNormalization?: boolean;
  /**
   * By default, rush passes --no-prefer-frozen-lockfile to 'pnpm install'. Set this option to
   * true to pass '--frozen-lockfile' instead.
   */
  usePnpmFrozenLockfileForRushInstall?: boolean;
}

/**
 * For use with the Rush tool, this file manages dependency versions that affect all
 * projects in the repo. See http://rushjs.io for details.
 */
export interface RushCommonVersionsConfig {
  /**
   * Part of the JSON Schema standard, this optional keyword declares the URL of the schema
   * that the file conforms to. Editors may download the schema and use it to perform syntax
   * highlighting.
   */
  readonly $schema?: 'https://developer.microsoft.com/json-schemas/rush/v5/common-versions.schema.json';
  /**
   * The "rush check" command can be used to enforce that every project in the repo must
   * specify the same SemVer range for a given dependency.  However, sometimes exceptions are
   * needed.  The allowedAlternativeVersions table allows you to list other SemVer ranges that
   * will be accepted by "rush check" for a given dependency. Note that the normal version
   * range (as inferred by looking at all projects in the repo) should NOT be included in this
   * list.
   */
  allowedAlternativeVersions?: { [key: string]: string[] };
  /**
   * When set to true, for all projects in the repo, all dependencies will be automatically
   * added as preferredVersions, except in cases where different projects specify different
   * version ranges for a given dependency.  For older package managers, this tended to reduce
   * duplication of indirect dependencies.  However, it can sometimes cause trouble for
   * indirect dependencies with incompatible peerDependencies ranges.
   */
  implicitlyPreferredVersions?: boolean;
  /**
   * A table that specifies a "preferred version" for a given NPM package.  This feature is
   * typically used to hold back an indirect dependency to a specific older version, or to
   * reduce duplication of indirect dependencies. The "preferredVersions" value can be any
   * SemVer range specifier (e.g. "~1.2.3").  Rush injects these values into the
   * "dependencies" field of the top-level common/temp/package.json, which influences how the
   * package manager will calculate versions.  The specific effect depends on your package
   * manager.  Generally it will have no effect on an incompatible or already constrained
   * SemVer range.  If you are using PNPM, similar effects can be achieved using the
   * pnpmfile.js hook.  See the Rush documentation for more details.
   */
  preferredVersions?: { [key: string]: string };
  /**
   * A table of specifies preferred versions maintained by the XStitch tool. See the Rush
   * documentation for details.
   */
  xstitchPreferredVersions?: { [key: string]: string };
}

/**
 * The main configuration file for the Rush multi-project build tool. See http://rushjs.io
 * for details.
 */
export interface RushJsonFile {
  /**
   * Part of the JSON Schema standard, this optional keyword declares the URL of the schema
   * that the file conforms to. Editors may download the schema and use it to perform syntax
   * highlighting.
   */
  $schema?: string;
  /**
   * Today the npmjs.com registry enforces fairly strict naming rules for packages, but in the
   * early days there was no standard and hardly any enforcement.  A few large legacy projects
   * are still using nonstandard package names, and private registries sometimes allow it.
   * Set "allowMostlyStandardPackageNames" to true to relax Rush's enforcement of package
   * names.  This allows upper case letters and in the future may relax other rules, however
   * we want to minimize these exceptions.  Many popular tools use certain punctuation
   * characters as delimiters, based on the assumption that they will never appear in a
   * package name; thus if we relax the rules too much it is likely to cause very confusing
   * malfunctions. The default value is false.
   */
  allowMostlyStandardPackageNames?: boolean;
  /**
   * Controls a package review workflow driven by the two config files
   * "browser-approved-packages.json" and "nonbrowser-approved-packages.json"
   */
  approvedPackagesPolicy?: ApprovedPackagesPolicy;
  /**
   * If true, consistent version specifiers for dependencies will be enforced (i.e. "rush
   * check" is run before some commands).
   */
  ensureConsistentVersions?: boolean;
  /**
   * Hooks are customized script actions that Rush executes when specific events occur.
   */
  eventHooks?: EventHooks;
  /**
   * If the project is stored in a Git repository, additional settings related to Git
   */
  gitPolicy?: GitPolicy;
  /**
   * Allows creation of hotfix changes. This feature is experimental so it is disabled by
   * default. If this is set, "rush change" only allows a "hotfix" change type to be
   * specified. This change type will be used when publishing subsequent changes from the
   * monorepo.
   */
  hotfixChangeEnabled?: boolean;
  /**
   * A node-semver expression (e.g. ">=1.2.3 <2.0.0", see https://github.com/npm/node-semver)
   * indicating which versions of Node.js can safely be used to build this repository.  If
   * omitted, no validation is performed.
   */
  nodeSupportedVersionRange?: string;
  /**
   * Options that are only used when the NPM package manager is selected.
   */
  npmOptions?: NpmOptions;
  /**
   * If specified, selects NPM as the package manager and specifies the deterministic version
   * to be installed by Rush.
   */
  npmVersion?: string;
  /**
   * Options that are only used when the PNPM pacakge manager is selected.
   */
  pnpmOptions?: PnpmOptions;
  /**
   * If specified, selects PNPM as the package manager and specifies the deterministic version
   * to be installed by Rush.
   */
  pnpmVersion?: string;
  /**
   * The maximum folder depth for the projectFolder field.  The default value is 2, i.e. a
   * single slash in the path name.
   */
  projectFolderMaxDepth?: number;
  /**
   * The minimum folder depth for the projectFolder field.  The default value is 1, i.e. no
   * slashes in the path name.
   */
  projectFolderMinDepth?: number;
  /**
   * A list of projects managed by this tool.
   */
  projects: RushProjectDefinition[];
  /**
   * The repository location
   */
  repository?: Repository;
  /**
   * The version of the Rush tool that will be used to build this repository.
   */
  rushVersion: string;
  /**
   * Rush normally prints a warning if it detects a pre-LTS Node.js version. If you are
   * testing pre-LTS versions in preparation for supporting the first LTS version, you can use
   * this setting to disable Rush's warning.
   */
  suppressNodeLtsWarning?: boolean;
  /**
   * Indicates whether telemetry data should be collected and stored in the Rush temp folder
   * during Rush runs.
   */
  telemetryEnabled?: boolean;
  /**
   * Defines the list of installation variants for this repository. For more details about
   * this feature, see this article: https://rushjs.io/pages/advanced/installation_variants/
   */
  variants?: Variant[];
  /**
   * Options that are only used when the Yarn pacakge manager is selected.
   */
  yarnOptions?: YarnOptions;
  /**
   * If specified, selects Yarn as the package manager and specifies the deterministic version
   * to be installed by Rush.
   */
  yarnVersion?: string;
}

/**
* Controls a package review workflow driven by the two config files
* "browser-approved-packages.json" and "nonbrowser-approved-packages.json"
*/
export interface ApprovedPackagesPolicy {
  /**
   * A list of NPM package scopes that will be excluded from review (e.g. "@types")
   */
  ignoredNpmScopes?: string[];
  /**
   * A list of category names that can be applied to each project, and then referenced in
   * "browser-approved-packages.json" and "nonbrowser-approved-packages.json"
   */
  reviewCategories?: string[];
}

/**
* Hooks are customized script actions that Rush executes when specific events occur.
*/
export interface EventHooks {
  /**
   * The list of scripts to run after the Rush build command finishes.
   */
  postRushBuild?: string[];
  /**
   * The list of scripts to run after the Rush installation finishes.
   */
  postRushInstall?: string[];
  /**
   * The list of scripts to run before the Rush build command starts.
   */
  preRushBuild?: string[];
  /**
   * The list of scripts to run before the Rush installation starts.
   */
  preRushInstall?: string[];
}

/**
* If the project is stored in a Git repository, additional settings related to Git
*/
export interface GitPolicy {
  /**
   * A list of regular expressions describing allowable e-mail patterns for Git commits.  They
   * are case-insensitive anchored JavaScript RegExps.  Example: ".*@example\.com"
   */
  allowedEmailRegExps?: string[];
  /**
   * The commit message to use when committing change log files "rush version". Defaults to
   * "Deleting change files and updating change logs for package updates."
   */
  changeLogUpdateCommitMessage?: string;
  /**
   * An example valid e-mail address for "Mr. Example" that conforms to one of the
   * allowedEmailRegExps.  Example: "mr-example@contoso\.com"
   */
  sampleEmail?: string;
  /**
   * The commit message to use when committing changes during "rush publish". Defaults to
   * "Applying package updates."
   */
  versionBumpCommitMessage?: string;
}

/**
* Options that are only used when the NPM package manager is selected.
*/
export interface NpmOptions {
  environmentVariables?: { [key: string]: EnvironmentVariable };
}

export interface EnvironmentVariable {
  override?: boolean;
  value?: string;
}

/**
* Options that are only used when the PNPM pacakge manager is selected.
*/
export interface PnpmOptions {
  environmentVariables?: { [key: string]: EnvironmentVariable };
  /**
   * Specifies the location of the PNPM store.  There are two possible values:
   *
   * "local" - use the "pnpm-store" folder in the current configured temp folder:
   * "common/temp/pnpm-store" by default.
   * "global" - use PNPM's global store, which has the benefit of being shared across multiple
   * repo folders, but the disadvantage of less isolation for builds (e.g. bugs or
   * incompatibilities when two repos use different releases of PNPM)
   *
   * In all cases, the store path will be overridden by the environment variable
   * RUSH_PNPM_STORE_PATH.
   *
   * The default value is "local".
   */
  pnpmStore?: PnpmStore;
  /**
   * If true, then "rush install" will report an error if manual modifications were made to
   * the PNPM shrinkwrap file without running `rush update` afterwards. To temporarily disable
   * this validation when invoking "rush install", use the "--bypassPolicy" command-line
   * parameter. The default value is false.
   */
  preventManualShrinkwrapChanges?: boolean;
  /**
   * Configures the strategy used to select versions during installation.  This feature
   * requires PNPM version 3.1 or newer.  It corresponds to the "--resolution-strategy"
   * command-line option for PNPM.  Possible values are "fast" and "fewer-dependencies".
   * PNPM's default is "fast", but this may be incompatible with certain packages, for example
   * the "@types" packages from DefinitelyTyped.  Rush's default is "fewer-dependencies",
   * which causes PNPM to avoid installing a newer version if an already installed version can
   * be reused; this is more similar to NPM's algorithm.
   */
  resolutionStrategy?: ResolutionStrategy;
  /**
   * If true, then Rush will add the "--strict-peer-dependencies" option when invoking PNPM.
   * This causes "rush install" to fail if there are unsatisfied peer dependencies, which is
   * an invalid state that can cause build failures or incompatible dependency versions. (For
   * historical reasons, JavaScript package managers generally do not treat this invalid state
   * as an error.) The default value is false.
   */
  strictPeerDependencies?: boolean;
  /**
   * If true, then Rush will use the workspaces feature to install and link packages when
   * invoking PNPM. The default value is false.
   */
  useWorkspaces?: boolean;
}

/**
* Specifies the location of the PNPM store.  There are two possible values:
*
* "local" - use the "pnpm-store" folder in the current configured temp folder:
* "common/temp/pnpm-store" by default.
* "global" - use PNPM's global store, which has the benefit of being shared across multiple
* repo folders, but the disadvantage of less isolation for builds (e.g. bugs or
* incompatibilities when two repos use different releases of PNPM)
*
* In all cases, the store path will be overridden by the environment variable
* RUSH_PNPM_STORE_PATH.
*
* The default value is "local".
*/
export enum PnpmStore {
  Global = 'global',
  Local = 'local',
}

/**
* Configures the strategy used to select versions during installation.  This feature
* requires PNPM version 3.1 or newer.  It corresponds to the "--resolution-strategy"
* command-line option for PNPM.  Possible values are "fast" and "fewer-dependencies".
* PNPM's default is "fast", but this may be incompatible with certain packages, for example
* the "@types" packages from DefinitelyTyped.  Rush's default is "fewer-dependencies",
* which causes PNPM to avoid installing a newer version if an already installed version can
* be reused; this is more similar to NPM's algorithm.
*/
export enum ResolutionStrategy {
  Fast = 'fast',
  FewerDependencies = 'fewer-dependencies',
}

export interface RushProjectDefinition {
  /**
   * A list of local projects that appear as devDependencies for this project, but cannot be
   * locally linked because it would create a cyclic dependency; instead, the last published
   * version will be installed in the Common folder.
   */
  cyclicDependencyProjects?: string[];
  /**
   * The NPM package name of the project.
   */
  packageName: string;
  /**
   * The path to the project folder relative to the Rush config file.
   */
  projectFolder: string;
  /**
   * Facilitates postprocessing of a project's files prior to publishing. If specified, the
   * "publishFolder" is the relative path to a subfolder of the project folder. The "rush
   * publish" command will publish the subfolder instead of the project folder. The subfolder
   * must contain its own package.json file, which is typically a build output.
   */
  publishFolder?: string;
  /**
   * An optional category for usage in the "browser-approved-packages.json" and
   * "nonbrowser-approved-packages.json" files.  Only strings from reviewCategories are
   * allowed here.
   */
  reviewCategory?: string;
  /**
   * A flag indicating that changes to this project will be published to npm, which affects
   * the Rush change and publish workflows.
   */
  shouldPublish?: boolean;
  /**
   * If true, then this project will be ignored by the "rush check" command.  The default
   * value is false.
   */
  skipRushCheck?: boolean;
  /**
   * An optional version policy associated with the project. Version policies are defined in
   * "version-policies.json" file.
   */
  versionPolicyName?: string;
}

/**
* The repository location
*/
export interface Repository {
  /**
   * The default branch name. This tells "rush change" which remote branch to compare against.
   * The default value is "master"
   */
  defaultBranch?: string;
  /**
   * The default remote. This tells "rush change" which remote to compare against if the
   * remote URL is not set or if a remote matching the provided remote URL is not found.
   */
  defaultRemote?: string;
  /**
   * The remote url of the repository. If a value is provided, "rush change" will use it to
   * find the right remote to compare against.
   */
  url?: string;
}

export interface Variant {
  description: string;
  /**
   * The name of the variant. Maps to common/rush/variants/{name} under the repository root.
   */
  variantName: string;
}

/**
* Options that are only used when the Yarn pacakge manager is selected.
*/
export interface YarnOptions {
  environmentVariables?: { [key: string]: EnvironmentVariable };
  /**
   * If true, then Rush will add the "--ignore-engines" option when invoking Yarn. * This
   * allows "rush install" to succeed if there are dependencies with engines defined in
   * package.json which do not match the current environment. The default value is false.
   */
  ignoreEngines?: boolean;
}


//#endregion

//#region Implementation
export interface RushOptions {
  /**
   * Today the npmjs.com registry enforces fairly strict naming rules for packages, but in the
   * early days there was no standard and hardly any enforcement.  A few large legacy projects
   * are still using nonstandard package names, and private registries sometimes allow it.
   * Set "allowMostlyStandardPackageNames" to true to relax Rush's enforcement of package
   * names.  This allows upper case letters and in the future may relax other rules, however
   * we want to minimize these exceptions.  Many popular tools use certain punctuation
   * characters as delimiters, based on the assumption that they will never appear in a
   * package name; thus if we relax the rules too much it is likely to cause very confusing
   * malfunctions. The default value is false.
   */
  allowMostlyStandardPackageNames?: boolean;
  /**
   * Controls a package review workflow driven by the two config files
   * "browser-approved-packages.json" and "nonbrowser-approved-packages.json"
   */
  approvedPackagesPolicy?: ApprovedPackagesPolicy;
  /**
   * If true, consistent version specifiers for dependencies will be enforced (i.e. "rush
   * check" is run before some commands).
   */
  ensureConsistentVersions?: boolean;
  /**
   * Hooks are customized script actions that Rush executes when specific events occur.
   */
  eventHooks?: EventHooks;
  /**
   * If the project is stored in a Git repository, additional settings related to Git
   */
  gitPolicy?: GitPolicy;
  /**
   * Allows creation of hotfix changes. This feature is experimental so it is disabled by
   * default. If this is set, "rush change" only allows a "hotfix" change type to be
   * specified. This change type will be used when publishing subsequent changes from the
   * monorepo.
   */
  hotfixChangeEnabled?: boolean;
  /**
   * A node-semver expression (e.g. ">=1.2.3 <2.0.0", see https://github.com/npm/node-semver)
   * indicating which versions of Node.js can safely be used to build this repository.  If
   * omitted, no validation is performed.
   */
  nodeSupportedVersionRange?: string;
  /**
   * Options that are only used when the NPM package manager is selected.
   */
  npmOptions?: NpmOptions;
  /**
   * If specified, selects NPM as the package manager and specifies the deterministic version
   * to be installed by Rush.
   */
  npmVersion?: string;
  /**
   * Options that are only used when the PNPM pacakge manager is selected.
   */
  pnpmOptions?: PnpmOptions;
  /**
   * If specified, selects PNPM as the package manager and specifies the deterministic version
   * to be installed by Rush.
   */
  pnpmVersion?: string;
  /**
   * The maximum folder depth for the projectFolder field.  The default value is 2, i.e. a
   * single slash in the path name.
   */
  projectFolderMaxDepth?: number;
  /**
   * The minimum folder depth for the projectFolder field.  The default value is 1, i.e. no
   * slashes in the path name.
   */
  projectFolderMinDepth?: number;

  /**
   * The repository location
   */
  repository?: Repository;
  /**
   * The version of the Rush tool that will be used to build this repository.
   */
  rushVersion: string;
  /**
   * Rush normally prints a warning if it detects a pre-LTS Node.js version. If you are
   * testing pre-LTS versions in preparation for supporting the first LTS version, you can use
   * this setting to disable Rush's warning.
   */
  suppressNodeLtsWarning?: boolean;
  /**
   * Indicates whether telemetry data should be collected and stored in the Rush temp folder
   * during Rush runs.
   */
  telemetryEnabled?: boolean;
  /**
   * Defines the list of installation variants for this repository. For more details about
   * this feature, see this article: https://rushjs.io/pages/advanced/installation_variants/
   */
  variants?: Variant[];
  /**
   * Options that are only used when the Yarn pacakge manager is selected.
   */
  yarnOptions?: YarnOptions;
  /**
   * If specified, selects Yarn as the package manager and specifies the deterministic version
   * to be installed by Rush.
   */
  yarnVersion?: string;
}

/**
 * Rush Monorepo options
 */
export interface RushMonorepoOptions extends NodeProjectOptions {
  rushOptions?: RushOptions;
}

export const PNPM_VERSION = '5.15.2';
export const NPM_VERSION = '4.5.0';
export const YARN_VERSION = '1.9.4';
export const RENDER_INSTALL_COMMAND = ['rush', 'update'].join(' ');
export const RUSH_RUN_COMMAND = 'rushx';
/**
 * rushjs monorepo
 * @pjid rush
 */
export class RushMonorepo extends NodeProject {
  protected readonly projects: RushProjectDefinition[];
  protected readonly rushJsonFile: RushJsonFile;

  constructor(options: RushMonorepoOptions) {
    super({ ...options });
    this.projects = new Array<RushProjectDefinition>();

    this.addFields({ private: true });

    this.rushJsonFile = {
      ...(options.rushOptions || {}),
      projects: new Array<RushProjectDefinition>(),
    } as RushJsonFile;

    switch (this.package.packageManager) {
      case NodePackageManager.PNPM:
        this.rushJsonFile.pnpmVersion = PNPM_VERSION;
        delete this.rushJsonFile.yarnVersion;
        delete this.rushJsonFile.npmVersion;
        break;
      case NodePackageManager.NPM:
        this.rushJsonFile.npmVersion = NPM_VERSION;
        delete this.rushJsonFile.yarnVersion;
        delete this.rushJsonFile.pnpmVersion;
        break;
      case NodePackageManager.YARN:
        this.rushJsonFile.yarnVersion = YARN_VERSION;
        delete this.rushJsonFile.pnpmVersion;
        delete this.rushJsonFile.npmVersion;
        break;
    }

    // Object.assign(this.package, { installCommand: RENDER_INSTALL_COMMAND });

    new JsonFile(this, path.join(this.outdir, 'rush.json'), { obj: this.rushJsonFile });
  }

  /**
   * Returns the shell command to execute in order to run a task. If
   * npmTaskExecution is set to PROJEN, the command will be `npx projen TASK`.
   * If it is set to SHELL, the command will be `yarn run TASK` (or `npm run
   * TASK`).
   * @param task
   * @override
   */
  public runTaskCommand(task: Task) {
    return `${RUSH_RUN_COMMAND} ${task.name}`;
  }
  /**
   * Add a new rush project in rush.json
   * @param rushProjectDefinition
   */
  public addProject(rushProjectDefinition: RushProjectDefinition, project: BaseProject): RushMonorepo {
    const projectDir = path.join(this.outdir, rushProjectDefinition.projectFolder);
    if (!fs.pathExistsSync(projectDir)) {
      fs.mkdirpSync(projectDir);
    }

    try {
      Object.assign(project, { outdir: projectDir });
      project.synth();
    } catch (e) {
      process.stderr.write(`Error when synthesizing rush package: ${e}\n`);
      throw e;
    }

    this.projects.push(rushProjectDefinition);

    return this;
  }
}

// #endregion

// #region Utils Generated by quicktype

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
// export class Convert {
//   public static toRushCommonDeployConfig(json: string): RushCommonDeployConfig {
//     return cast(JSON.parse(json), r('RushCommonDeployConfig'));
//   }

//   public static rushCommonDeployConfigToJson(value: RushCommonDeployConfig): string {
//     return JSON.stringify(uncast(value, r('RushCommonDeployConfig')), null, 2);
//   }

//   public static toRushCommonExperimentsConfig(json: string): RushCommonExperimentsConfig {
//     return cast(JSON.parse(json), r('RushCommonExperimentsConfig'));
//   }

//   public static rushCommonExperimentsConfigToJson(value: RushCommonExperimentsConfig): string {
//     return JSON.stringify(uncast(value, r('RushCommonExperimentsConfig')), null, 2);
//   }

//   public static toRushCommonVersionsConfig(json: string): RushCommonVersionsConfig {
//     return cast(JSON.parse(json), r('RushCommonVersionsConfig'));
//   }

//   public static rushCommonVersionsConfigToJson(value: RushCommonVersionsConfig): string {
//     return JSON.stringify(uncast(value, r('RushCommonVersionsConfig')), null, 2);
//   }

//   public static toRushJsonFile(json: string): RushJsonFile {
//     return cast(JSON.parse(json), r('RushJsonFile'));
//   }

//   public static rushJsonFileToJson(value: RushJsonFile): string {
//     return JSON.stringify(uncast(value, r('RushJsonFile')), null, 2);
//   }
// }

// function invalidValue(typ: any, val: any, key: any = ''): never {
//   if (key) {
//     throw Error(`Invalid value for key "${key}". Expected type ${JSON.stringify(typ)} but got ${JSON.stringify(val)}`);
//   }
//   throw Error(`Invalid value ${JSON.stringify(val)} for type ${JSON.stringify(typ)}` );
// }

// function jsonToJSProps(typ: any): any {
//   if (typ.jsonToJS === undefined) {
//     const map: any = {};
//     typ.props.forEach((p: any) => map[p.json] = { key: p.js, typ: p.typ });
//     typ.jsonToJS = map;
//   }
//   return typ.jsonToJS;
// }

// function jsToJSONProps(typ: any): any {
//   if (typ.jsToJSON === undefined) {
//     const map: any = {};
//     typ.props.forEach((p: any) => map[p.js] = { key: p.json, typ: p.typ });
//     typ.jsToJSON = map;
//   }
//   return typ.jsToJSON;
// }

// function transform(val: any, typ: any, getProps: any, key: any = ''): any {
//   function transformPrimitive(typ: string, val: any): any {
//     if (typeof typ === typeof val) return val;
//     return invalidValue(typ, val, key);
//   }

//   function transformUnion(typs: any[], val: any): any {
//     // val must validate against one typ in typs
//     const l = typs.length;
//     for (let i = 0; i < l; i++) {
//       const typ = typs[i];
//       try {
//         return transform(val, typ, getProps);
//       } catch (_) {}
//     }
//     return invalidValue(typs, val);
//   }

//   function transformEnum(cases: string[], val: any): any {
//     if (cases.indexOf(val) !== -1) return val;
//     return invalidValue(cases, val);
//   }

//   function transformArray(typ: any, val: any): any {
//     // val must be an array with no invalid elements
//     if (!Array.isArray(val)) return invalidValue('array', val);
//     return val.map(el => transform(el, typ, getProps));
//   }

//   function transformDate(val: any): any {
//     if (val === null) {
//       return null;
//     }
//     const d = new Date(val);
//     if (isNaN(d.valueOf())) {
//       return invalidValue('Date', val);
//     }
//     return d;
//   }

//   function transformObject(props: { [k: string]: any }, additional: any, val: any): any {
//     if (val === null || typeof val !== 'object' || Array.isArray(val)) {
//       return invalidValue('object', val);
//     }
//     const result: any = {};
//     Object.getOwnPropertyNames(props).forEach(key => {
//       const prop = props[key];
//       const v = Object.prototype.hasOwnProperty.call(val, key) ? val[key] : undefined;
//       result[prop.key] = transform(v, prop.typ, getProps, prop.key);
//     });
//     Object.getOwnPropertyNames(val).forEach(key => {
//       if (!Object.prototype.hasOwnProperty.call(props, key)) {
//         result[key] = transform(val[key], additional, getProps, key);
//       }
//     });
//     return result;
//   }

//   if (typ === 'any') return val;
//   if (typ === null) {
//     if (val === null) return val;
//     return invalidValue(typ, val);
//   }
//   if (typ === false) return invalidValue(typ, val);
//   while (typeof typ === 'object' && typ.ref !== undefined) {
//     typ = typeMap[typ.ref];
//   }
//   if (Array.isArray(typ)) return transformEnum(typ, val);
//   if (typeof typ === 'object') {
//     return typ.hasOwnProperty('unionMembers') ? transformUnion(typ.unionMembers, val)
//       : typ.hasOwnProperty('arrayItems') ? transformArray(typ.arrayItems, val)
//         : typ.hasOwnProperty('props') ? transformObject(getProps(typ), typ.additional, val)
//           : invalidValue(typ, val);
//   }
//   // Numbers can be parsed by Date but shouldn't be.
//   if (typ === Date && typeof val !== 'number') return transformDate(val);
//   return transformPrimitive(typ, val);
// }

// function cast<T>(val: any, typ: any): T {
//   return transform(val, typ, jsonToJSProps);
// }

// function uncast<T>(val: T, typ: any): any {
//   return transform(val, typ, jsToJSONProps);
// }

// function a(typ: any) {
//   return { arrayItems: typ };
// }

// function u(...typs: any[]) {
//   return { unionMembers: typs };
// }

// function o(props: any[], additional: any) {
//   return { props, additional };
// }

// function m(additional: any) {
//   return { props: [], additional };
// }

// function r(name: string) {
//   return { ref: name };
// }

// const typeMap: any = {
//   RushCommonDeployConfig: o([
//     { json: '$schema', js: '$schema', typ: u(undefined, '') },
//     { json: 'deploymentProjectNames', js: 'deploymentProjectNames', typ: a('') },
//     { json: 'folderToCopy', js: 'folderToCopy', typ: u(undefined, '') },
//     { json: 'includeDevDependencies', js: 'includeDevDependencies', typ: u(undefined, true) },
//     { json: 'includeNpmIgnoreFiles', js: 'includeNpmIgnoreFiles', typ: u(undefined, true) },
//     { json: 'linkCreation', js: 'linkCreation', typ: u(undefined, r('LinkCreation')) },
//     { json: 'omitPnpmWorkaroundLinks', js: 'omitPnpmWorkaroundLinks', typ: u(undefined, true) },
//     { json: 'projectSettings', js: 'projectSettings', typ: u(undefined, a(r('ProjectSetting'))) },
//   ], false),
//   ProjectSetting: o([
//     { json: 'additionalDependenciesToInclude', js: 'additionalDependenciesToInclude', typ: u(undefined, a('')) },
//     { json: 'additionalProjectsToInclude', js: 'additionalProjectsToInclude', typ: u(undefined, a('')) },
//     { json: 'dependenciesToExclude', js: 'dependenciesToExclude', typ: u(undefined, a('')) },
//     { json: 'projectName', js: 'projectName', typ: '' },
//   ], false),
//   LinkCreation: [
//     'default',
//     'none',
//     'script',
//   ],
//   RushCommonExperimentsConfig: o([
//     { json: '$schema', js: '$schema', typ: u(undefined, '') },
//     { json: 'buildCache', js: 'buildCache', typ: u(undefined, true) },
//     { json: 'legacyIncrementalBuildDependencyDetection', js: 'legacyIncrementalBuildDependencyDetection', typ: u(undefined, true) },
//     { json: 'noChmodFieldInTarHeaderNormalization', js: 'noChmodFieldInTarHeaderNormalization', typ: u(undefined, true) },
//     { json: 'usePnpmFrozenLockfileForRushInstall', js: 'usePnpmFrozenLockfileForRushInstall', typ: u(undefined, true) },
//   ], false),
//   RushCommonVersionsConfig: o([
//     { json: '$schema', js: '$schema', typ: u(undefined, '') },
//     { json: 'allowedAlternativeVersions', js: 'allowedAlternativeVersions', typ: u(undefined, m(a(''))) },
//     { json: 'implicitlyPreferredVersions', js: 'implicitlyPreferredVersions', typ: u(undefined, true) },
//     { json: 'preferredVersions', js: 'preferredVersions', typ: u(undefined, m('')) },
//     { json: 'xstitchPreferredVersions', js: 'xstitchPreferredVersions', typ: u(undefined, m('')) },
//   ], false),
//   RushJsonFile: o([
//     { json: '$schema', js: '$schema', typ: u(undefined, '') },
//     { json: 'allowMostlyStandardPackageNames', js: 'allowMostlyStandardPackageNames', typ: u(undefined, true) },
//     { json: 'approvedPackagesPolicy', js: 'approvedPackagesPolicy', typ: u(undefined, r('ApprovedPackagesPolicy')) },
//     { json: 'ensureConsistentVersions', js: 'ensureConsistentVersions', typ: u(undefined, true) },
//     { json: 'eventHooks', js: 'eventHooks', typ: u(undefined, r('EventHooks')) },
//     { json: 'gitPolicy', js: 'gitPolicy', typ: u(undefined, r('GitPolicy')) },
//     { json: 'hotfixChangeEnabled', js: 'hotfixChangeEnabled', typ: u(undefined, true) },
//     { json: 'nodeSupportedVersionRange', js: 'nodeSupportedVersionRange', typ: u(undefined, '') },
//     { json: 'npmOptions', js: 'npmOptions', typ: u(undefined, r('NpmOptions')) },
//     { json: 'npmVersion', js: 'npmVersion', typ: u(undefined, '') },
//     { json: 'pnpmOptions', js: 'pnpmOptions', typ: u(undefined, r('PnpmOptions')) },
//     { json: 'pnpmVersion', js: 'pnpmVersion', typ: u(undefined, '') },
//     { json: 'projectFolderMaxDepth', js: 'projectFolderMaxDepth', typ: u(undefined, 3.14) },
//     { json: 'projectFolderMinDepth', js: 'projectFolderMinDepth', typ: u(undefined, 3.14) },
//     { json: 'projects', js: 'projects', typ: a(r('RushProject')) },
//     { json: 'repository', js: 'repository', typ: u(undefined, r('Repository')) },
//     { json: 'rushVersion', js: 'rushVersion', typ: '' },
//     { json: 'suppressNodeLtsWarning', js: 'suppressNodeLtsWarning', typ: u(undefined, true) },
//     { json: 'telemetryEnabled', js: 'telemetryEnabled', typ: u(undefined, true) },
//     { json: 'variants', js: 'variants', typ: u(undefined, a(r('Variant'))) },
//     { json: 'yarnOptions', js: 'yarnOptions', typ: u(undefined, r('YarnOptions')) },
//     { json: 'yarnVersion', js: 'yarnVersion', typ: u(undefined, '') },
//   ], false),
//   ApprovedPackagesPolicy: o([
//     { json: 'ignoredNpmScopes', js: 'ignoredNpmScopes', typ: u(undefined, a('')) },
//     { json: 'reviewCategories', js: 'reviewCategories', typ: u(undefined, a('')) },
//   ], false),
//   EventHooks: o([
//     { json: 'postRushBuild', js: 'postRushBuild', typ: u(undefined, a('')) },
//     { json: 'postRushInstall', js: 'postRushInstall', typ: u(undefined, a('')) },
//     { json: 'preRushBuild', js: 'preRushBuild', typ: u(undefined, a('')) },
//     { json: 'preRushInstall', js: 'preRushInstall', typ: u(undefined, a('')) },
//   ], false),
//   GitPolicy: o([
//     { json: 'allowedEmailRegExps', js: 'allowedEmailRegExps', typ: u(undefined, a('')) },
//     { json: 'changeLogUpdateCommitMessage', js: 'changeLogUpdateCommitMessage', typ: u(undefined, '') },
//     { json: 'sampleEmail', js: 'sampleEmail', typ: u(undefined, '') },
//     { json: 'versionBumpCommitMessage', js: 'versionBumpCommitMessage', typ: u(undefined, '') },
//   ], false),
//   NpmOptions: o([
//     { json: 'environmentVariables', js: 'environmentVariables', typ: u(undefined, m(r('EnvironmentVariable'))) },
//   ], false),
//   EnvironmentVariable: o([
//     { json: 'override', js: 'override', typ: u(undefined, true) },
//     { json: 'value', js: 'value', typ: u(undefined, '') },
//   ], false),
//   PnpmOptions: o([
//     { json: 'environmentVariables', js: 'environmentVariables', typ: u(undefined, m(r('EnvironmentVariable'))) },
//     { json: 'pnpmStore', js: 'pnpmStore', typ: u(undefined, r('PnpmStore')) },
//     { json: 'preventManualShrinkwrapChanges', js: 'preventManualShrinkwrapChanges', typ: u(undefined, true) },
//     { json: 'resolutionStrategy', js: 'resolutionStrategy', typ: u(undefined, r('ResolutionStrategy')) },
//     { json: 'strictPeerDependencies', js: 'strictPeerDependencies', typ: u(undefined, true) },
//     { json: 'useWorkspaces', js: 'useWorkspaces', typ: u(undefined, true) },
//   ], false),
//   RushProject: o([
//     { json: 'cyclicDependencyProjects', js: 'cyclicDependencyProjects', typ: u(undefined, a('')) },
//     { json: 'packageName', js: 'packageName', typ: '' },
//     { json: 'projectFolder', js: 'projectFolder', typ: '' },
//     { json: 'publishFolder', js: 'publishFolder', typ: u(undefined, '') },
//     { json: 'reviewCategory', js: 'reviewCategory', typ: u(undefined, '') },
//     { json: 'shouldPublish', js: 'shouldPublish', typ: u(undefined, true) },
//     { json: 'skipRushCheck', js: 'skipRushCheck', typ: u(undefined, true) },
//     { json: 'versionPolicyName', js: 'versionPolicyName', typ: u(undefined, '') },
//   ], false),
//   Repository: o([
//     { json: 'defaultBranch', js: 'defaultBranch', typ: u(undefined, '') },
//     { json: 'defaultRemote', js: 'defaultRemote', typ: u(undefined, '') },
//     { json: 'url', js: 'url', typ: u(undefined, '') },
//   ], false),
//   Variant: o([
//     { json: 'description', js: 'description', typ: '' },
//     { json: 'variantName', js: 'variantName', typ: '' },
//   ], 'any'),
//   YarnOptions: o([
//     { json: 'environmentVariables', js: 'environmentVariables', typ: u(undefined, m(r('EnvironmentVariable'))) },
//     { json: 'ignoreEngines', js: 'ignoreEngines', typ: u(undefined, true) },
//   ], false),
//   PnpmStore: [
//     'global',
//     'local',
//   ],
//   ResolutionStrategy: [
//     'fast',
//     'fewer-dependencies',
//   ],
// };

// #endregion
