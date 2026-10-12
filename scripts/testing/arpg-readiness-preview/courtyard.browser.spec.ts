import { test } from './guard';
import { COURTYARD_TITLES } from './courtyard-contract.mjs';
import { runCourtyard } from './courtyard-browser';
for(const[index,title]of COURTYARD_TITLES.entries())test(title,async({page},info)=>runCourtyard(page,info,index));
