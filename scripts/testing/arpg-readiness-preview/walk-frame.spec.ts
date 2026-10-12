import type { Page, TestInfo } from '@playwright/test';
import { test } from './guard';
import { WALK_TITLES } from './walk-frame-contract.mjs';
import { runWalkFrameVisual } from './walk-frame-browser';
for(const[index,title]of WALK_TITLES.entries())test(title,async({page}:{page:Page},info:TestInfo)=>runWalkFrameVisual(page,info,index));
