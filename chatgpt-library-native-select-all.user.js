// ==UserScript==
// @name         ChatGPT Library - Native Select All
// @namespace    local.cevapi.chatgpt
// @version      1.0.0
// @description  Adds Select all to ChatGPT Library image selection using ChatGPT's native image selectors.
// @match        https://chatgpt.com/*
// @match        https://www.chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function()
{
	'use strict';
	
	const BUTTON_ID = 'cgpt-native-select-all';
	const STYLE_ID = 'cgpt-native-select-all-style';
	const INSTALL_DELAY_MS = 100;
	const COUNT_CHANGE_TIMEOUT_MS = 350;
	
	let selecting = false;
	let installTimer = null;
	let countElementCache = null;
	let toolbarCache = null;
	
	function normaliseText(value)
	{
		return String(value || '').replace(/\s+/g, ' ').trim();
	}
	
	function isVisible(element)
	{
		if(!(element instanceof Element))
			return false;
		
		const rect = element.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0 && element.getClientRects().length > 0;
	}
	
	function parseSelectedCount(element)
	{
		if(!(element instanceof Element))
			return null;
		
		const match = normaliseText(element.textContent).match(/^(\d+)\s+selected$/i);
		return match ? Number(match[1]) : null;
	}
	
	function findSelectedCountElement(root)
	{
		for(const element of root.querySelectorAll('span, div, p'))
		{
			if(element.children.length > 0 || element.id === BUTTON_ID
				|| element.closest(`#${BUTTON_ID}`) || !isVisible(element))
				continue;
			
			if(parseSelectedCount(element) !== null)
				return element;
		}
		
		return null;
	}
	
	function getNativeSelectedCountElement()
	{
		if(countElementCache?.isConnected && isVisible(countElementCache)
			&& parseSelectedCount(countElementCache) !== null)
			return countElementCache;
		
		countElementCache = toolbarCache?.isConnected
			? findSelectedCountElement(toolbarCache)
			: null;
		
		if(!countElementCache)
			countElementCache = findSelectedCountElement(document);
		
		return countElementCache;
	}
	
	function getNativeSelectedCount()
	{
		return parseSelectedCount(getNativeSelectedCountElement()) ?? 0;
	}
	
	function findNativeSelectionToolbar()
	{
		const countElement = getNativeSelectedCountElement();
		if(!countElement)
		{
			toolbarCache = null;
			return null;
		}
		
		if(toolbarCache?.isConnected && toolbarCache.contains(countElement))
			return toolbarCache;
		
		let element = countElement.parentElement;
		let best = null;
		
		for(let depth = 0; element && depth < 8; depth++, element = element.parentElement)
		{
			const rect = element.getBoundingClientRect();
			if(element.querySelectorAll('button').length < 2 || rect.width < 220
				|| rect.height < 34)
				continue;
			
			best = element;
			const position = getComputedStyle(element).position;
			if(position === 'fixed' || position === 'sticky'
				|| rect.bottom >= window.innerHeight - 80)
				break;
		}
		
		toolbarCache = best;
		return best;
	}
	
	function controlCenter(control)
	{
		const rect = control.getBoundingClientRect();
		return {
			x: rect.left + rect.width / 2,
			y: rect.top + rect.height / 2
		};
	}
	
	function sortControls(controls)
	{
		return controls.sort((a, b) =>
		{
			const ar = a.getBoundingClientRect();
			const br = b.getBoundingClientRect();
			return Math.abs(ar.top - br.top) > 8
				? ar.top - br.top
				: ar.left - br.left;
		});
	}
	
	function pickRepeatedControlGroup(candidates)
	{
		const byPosition = new Map();
		
		for(const candidate of candidates)
		{
			const rect = candidate.getBoundingClientRect();
			const centerX = rect.left + rect.width / 2;
			const centerY = rect.top + rect.height / 2;
			const key = `${Math.round(centerX / 6)}:${Math.round(centerY / 6)}`;
			const existing = byPosition.get(key);
			
			if(!existing)
			{
				byPosition.set(key, candidate);
				continue;
			}
			
			const existingRect = existing.getBoundingClientRect();
			if(rect.width * rect.height > existingRect.width * existingRect.height)
				byPosition.set(key, candidate);
		}
		
		const groups = new Map();
		for(const candidate of byPosition.values())
		{
			const rect = candidate.getBoundingClientRect();
			const key = `${Math.round(rect.width / 2) * 2}x${Math.round(rect.height / 2) * 2}`;
			const group = groups.get(key) || [];
			group.push(candidate);
			groups.set(key, group);
		}
		
		let best = [];
		for(const group of groups.values())
		{
			if(group.length > best.length)
				best = group;
		}
		
		return best.length >= 4 ? sortControls(best) : [];
	}
	
	function collectSelectorCandidates(root, toolbar, broad = false)
	{
		const selector = broad
			? 'div, span, label'
			: 'button, [role="button"], [role="checkbox"], input[type="checkbox"], [aria-checked], [aria-pressed]';
		const mainRect = root.getBoundingClientRect();
		const candidates = [];
		
		for(const element of root.querySelectorAll(selector))
		{
			if(!(element instanceof HTMLElement) || element.id === BUTTON_ID
				|| element.closest(`#${BUTTON_ID}`)
				|| element.closest('#gpt-bulk-image-toolbar, .gpt-bulk-image-checkbox')
				|| element.closest('header, nav, [role="dialog"], [role="menu"]')
				|| (toolbar && toolbar.contains(element)) || !isVisible(element))
				continue;
			
			if(broad)
			{
				const style = getComputedStyle(element);
				if(style.cursor !== 'pointer' && !element.querySelector(':scope > svg'))
					continue;
			}
			
			const rect = element.getBoundingClientRect();
			const minSide = Math.min(rect.width, rect.height);
			const maxSide = Math.max(rect.width, rect.height);
			
			if(minSide < 14 || maxSide > 48 || maxSide / minSide > 1.35
				|| rect.right < mainRect.left || rect.left > mainRect.right
				|| rect.top < Math.max(mainRect.top + 55, 70)
				|| normaliseText(element.textContent).length > 2)
				continue;
			
			candidates.push(element);
		}
		
		return candidates;
	}
	
	function getNativeImageSelectionControls()
	{
		const main = document.querySelector('main');
		if(!main)
			return [];
		
		const toolbar = findNativeSelectionToolbar();
		let controls = pickRepeatedControlGroup(
			collectSelectorCandidates(main, toolbar)
		);
		
		if(controls.length === 0)
		{
			controls = pickRepeatedControlGroup(
				collectSelectorCandidates(main, toolbar, true)
			);
		}
		
		return controls;
	}
	
	function getExplicitSelectionState(control)
	{
		if(control instanceof HTMLInputElement && control.type === 'checkbox')
			return control.checked;
		
		for(const attribute of ['aria-checked', 'aria-pressed', 'data-selected'])
		{
			const value = control.getAttribute(attribute);
			if(value === 'true')
				return true;
			if(value === 'false')
				return false;
		}
		
		const state = normaliseText(control.getAttribute('data-state')).toLowerCase();
		if(['checked', 'on', 'selected'].includes(state))
			return true;
		if(['unchecked', 'off', 'unselected'].includes(state))
			return false;
		
		const label = `${normaliseText(control.getAttribute('aria-label'))} ${normaliseText(control.getAttribute('title'))}`.toLowerCase();
		if(/\b(deselect|unselect)\b/.test(label))
			return true;
		if(/\bselect\b/.test(label))
			return false;
		
		return null;
	}
	
	function nextFrame()
	{
		return new Promise(resolve => requestAnimationFrame(resolve));
	}
	
	async function waitForSelectedCountChange(previousCount)
	{
		let currentCount = getNativeSelectedCount();
		if(currentCount !== previousCount)
			return currentCount;
		
		const deadline = performance.now() + COUNT_CHANGE_TIMEOUT_MS;
		while(performance.now() < deadline)
		{
			await nextFrame();
			currentCount = getNativeSelectedCount();
			if(currentCount !== previousCount)
				return currentCount;
		}
		
		return currentCount;
	}
	
	function findControlNear(point)
	{
		let best = null;
		let bestDistance = Infinity;
		
		for(const control of getNativeImageSelectionControls())
		{
			const center = controlCenter(control);
			const distance = Math.hypot(center.x - point.x, center.y - point.y);
			if(distance < bestDistance)
			{
				best = control;
				bestDistance = distance;
			}
		}
		
		return bestDistance <= 18 ? best : null;
	}
	
	function resolveControl(target)
	{
		return target.control?.isConnected
			? target.control
			: findControlNear(target.point);
	}
	
	async function selectAllNative(button)
	{
		if(selecting)
			return;
		
		selecting = true;
		button.disabled = true;
		
		try
		{
			const controls = getNativeImageSelectionControls();
			if(controls.length === 0)
			{
				button.textContent = 'No image selectors found';
				await new Promise(resolve => setTimeout(resolve, 1200));
				return;
			}
			
			const targets = controls.map(control => ({
				control,
				point: controlCenter(control)
			}));
			
			for(let index = 0; index < targets.length; index++)
			{
				const target = targets[index];
				let control = resolveControl(target);
				button.textContent = `Selecting ${index + 1}/${targets.length}`;
				
				if(!control)
					continue;
				
				const explicitState = getExplicitSelectionState(control);
				if(explicitState === true)
					continue;
				if(explicitState === false)
				{
					control.click();
					continue;
				}
				
				const beforeCount = getNativeSelectedCount();
				control.click();
				const afterCount = await waitForSelectedCountChange(beforeCount);
				
				// Unknown-state controls may already be selected. Restore them if clicked off.
				if(afterCount < beforeCount)
				{
					control = resolveControl(target);
					if(control)
					{
						control.click();
						await waitForSelectedCountChange(afterCount);
					}
				}
			}
			
			await nextFrame();
			button.textContent = `Selected ${getNativeSelectedCount()}`;
			await new Promise(resolve => setTimeout(resolve, 700));
		}
		finally
		{
			selecting = false;
			button.disabled = false;
			button.textContent = 'Select all';
		}
	}
	
	function ensureStyle()
	{
		if(document.getElementById(STYLE_ID))
			return;
		
		const style = document.createElement('style');
		style.id = STYLE_ID;
		style.textContent = `
#${BUTTON_ID} {
	appearance: none;
	border: 0;
	border-radius: 9999px;
	padding: 8px 14px;
	font: inherit;
	font-size: 14px;
	font-weight: 500;
	line-height: 20px;
	white-space: nowrap;
	cursor: pointer;
	background: rgba(0, 0, 0, 0.08);
	color: inherit;
}
#${BUTTON_ID}:hover {
	background: rgba(0, 0, 0, 0.13);
}
#${BUTTON_ID}:disabled {
	cursor: default;
	opacity: 0.65;
}
:root[data-theme="dark"] #${BUTTON_ID},
.chatgpt-theme[data-theme="dark"] #${BUTTON_ID} {
	background: rgba(255, 255, 255, 0.12);
}
:root[data-theme="dark"] #${BUTTON_ID}:hover,
.chatgpt-theme[data-theme="dark"] #${BUTTON_ID}:hover {
	background: rgba(255, 255, 255, 0.18);
}
`;
		document.head.appendChild(style);
	}
	
	function installSelectAllButton()
	{
		const toolbar = findNativeSelectionToolbar();
		const existing = document.getElementById(BUTTON_ID);
		
		if(!toolbar)
		{
			existing?.remove();
			return;
		}
		
		if(existing && toolbar.contains(existing))
			return;
		
		existing?.remove();
		ensureStyle();
		
		const button = document.createElement('button');
		button.id = BUTTON_ID;
		button.type = 'button';
		button.textContent = 'Select all';
		button.setAttribute('aria-label', 'Select all images');
		button.addEventListener('click', event =>
		{
			event.preventDefault();
			event.stopPropagation();
			void selectAllNative(button);
		});
		
		const countElement = getNativeSelectedCountElement();
		let insertionPoint = countElement;
		while(insertionPoint?.parentElement && insertionPoint.parentElement !== toolbar)
			insertionPoint = insertionPoint.parentElement;
		
		if(insertionPoint?.parentElement === toolbar)
			insertionPoint.insertAdjacentElement('afterend', button);
		else
			toolbar.prepend(button);
	}
	
	function scheduleInstall()
	{
		clearTimeout(installTimer);
		installTimer = setTimeout(installSelectAllButton, INSTALL_DELAY_MS);
	}
	
	const observer = new MutationObserver(scheduleInstall);
	observer.observe(document.documentElement, {
		childList: true,
		subtree: true
	});
	
	document.addEventListener('click', scheduleInstall, true);
	window.addEventListener('popstate', scheduleInstall);
	window.addEventListener('hashchange', scheduleInstall);
	
	installSelectAllButton();
})();
