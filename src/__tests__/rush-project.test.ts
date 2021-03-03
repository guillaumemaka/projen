import { LogLevel } from '..';
import * as logging from '../logging';
import { RushMonorepo, RushMonorepoOptions, YARN_VERSION } from './../rush-project';
import { mkdtemp, synthSnapshot } from './util';

logging.disable();

test('rush.json is added by default', () => {
  const project = new TestRushMonorepoProject();

  const rushJson = findFileInSnapshot(synthSnapshot(project), 'rush.json');
  expect(rushJson.yarnVersion).toEqual(YARN_VERSION);
  expect(rushJson.npmVersion).toBeUndefined();
  expect(rushJson.pnpmVersion).toBeUndefined();
});

function findFileInSnapshot(snapshot: any, filename: string): any | undefined {
  const keys = Object.keys(snapshot).find((k: string) => k.endsWith(filename));
  if (keys) {
    return snapshot[keys];
  }

  return undefined;
}

class TestRushMonorepoProject extends RushMonorepo {
  constructor(options: Partial<RushMonorepoOptions> = {}) {
    super({
      outdir: mkdtemp(),
      name: 'test-node-project',
      logging: {
        level: LogLevel.OFF,
      },
      defaultReleaseBranch: 'main',
      releaseWorkflow: false,
      buildWorkflow: false,
      rebuildBot: false,
      dependabot: false,
      ...options,
    });
  }
}