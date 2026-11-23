import {expect,it} from 'vitest';
import {title} from '../../i18n/zh-CN';
it('loads the project title',()=>expect(title.length).toBeGreaterThan(0));
