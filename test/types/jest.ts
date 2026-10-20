// The Jest environment's types: options, and a custom environment built on it.
import WarpdomEnvironment, { type WarpdomJestEnvironmentOptions } from 'warpdom/jest';

const testEnvironmentOptions: WarpdomJestEnvironmentOptions = { url: 'http://localhost/', jsdom: 26, fastFrames: true, xhr: false, customExportConditions: ['browser'] };
export const config = { testEnvironment: 'warpdom/jest', testEnvironmentOptions };

export class CustomEnvironment extends WarpdomEnvironment {
  override async setup(): Promise<void> {
    await super.setup();
    const width: number = this.global.innerWidth;
    this.global.document.body.dataset['width'] = String(width);
  }
}

// @ts-expect-error: url is a string
const wrong: WarpdomJestEnvironmentOptions = { url: 1 };
void wrong;
