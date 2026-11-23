import React from 'react';
import {createRoot} from 'react-dom/client';
import {title} from './i18n/zh-CN';
document.title = title;
createRoot(document.querySelector('#root')).render(<main>{title}</main>);

