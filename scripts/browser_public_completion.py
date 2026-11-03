"""Rendered QA against the exact built, read-only public Worker."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5199/'
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('artifacts/completion-20261102/public-browser')
OUT.mkdir(parents=True, exist_ok=False)
checks = []
errors = []
def check(name, value):
    checks.append({'name': name, 'passed': bool(value)})
    if not value:
        raise AssertionError(name)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        for route in ['', 'market', 'compare', 'courses', 'pathways', 'opportunities']:
            response = page.goto(BASE + '#/' + route)
            page.locator('h1').wait_for()
            page.wait_for_timeout(250)
            check('public page renders: ' + (route or 'home'), page.locator('h1').count() == 1)
            check('public entry has no login form: ' + route, page.locator('input[type=password]').count() == 0)
            headers = response.headers if response else context.request.get(BASE).headers
            check('CSP header is served by Worker: ' + route, 'default-src' in (headers.get('content-security-policy') or ''))
        page.goto(BASE + '#/opportunities')
        page.locator('.opportunity-card').first.wait_for()
        check('current list excludes historical activity', page.locator('.opportunity-card').count() == 5)
        check('synthetic data status visible', 'SYNTHETIC' in page.locator('.synthetic-banner').inner_text())
        search = page.get_by_role('searchbox')
        search.fill('does-not-exist')
        check('empty results explicit', page.locator('.opportunity-card').count() == 0)
        page.get_by_role('button', name='Clear filters', exact=True).click()
        page.locator('.opportunity-card').first.wait_for()
        page.get_by_text('Activity type (0)', exact=True).click()
        page.get_by_label('Workshop', exact=True).check()
        page.get_by_text('Topic (0)', exact=True).click()
        page.get_by_label('Finance', exact=True).check()
        check('cross-dimension AND produces no match', page.locator('.opportunity-card').count() == 0)
        page.get_by_label('Networking', exact=True).check()
        page.locator('.opportunity-card').first.wait_for()
        check('same-dimension OR restores finance networking', page.locator('.opportunity-card').count() == 1 and 'Finance networking' in page.locator('.opportunity-card').inner_text())
        saved_url = page.url
        page.reload(); page.locator('.opportunity-card').first.wait_for()
        check('filter URL survives reload', page.url == saved_url and page.locator('.opportunity-card').count() == 1)
        page.get_by_role('button', name='中文', exact=True).click()
        check('language switch retains canonical filters', 'type=workshop' in page.url and 'topic=finance' in page.url and page.locator('.opportunity-card').count() == 1)
        page.get_by_role('button', name='English', exact=True).click()
        page.get_by_role('button', name='Clear filters', exact=True).click()
        page.get_by_label('Starts on or after', exact=True).fill('2027-03-14')
        page.get_by_label('Starts on or before', exact=True).fill('2027-03-14')
        page.get_by_role('button', name='Apply dates', exact=True).click()
        page.wait_for_timeout(100)
        check('date boundaries inclusive and unknown dates excluded', page.locator('.opportunity-card').count() == 2)
        url_before_bad_dates = page.url
        page.get_by_label('Starts on or after', exact=True).fill('2028-01-01')
        page.get_by_role('button', name='Apply dates', exact=True).click()
        check('reverse dates preserve URL and results', page.url == url_before_bad_dates and page.locator('[role=alert]').count() == 1 and page.locator('.opportunity-card').count() == 2)
        page.get_by_role('button', name='Clear filters', exact=True).click()
        unknown = page.locator('.opportunity-card').filter(has_text='Date to be announced')
        check('unknown date cannot produce ICS', unknown.get_by_role('button', name='Download calendar (.ics)', exact=True).is_disabled())
        workshop = page.locator('.opportunity-card').filter(has_text='Python data workshop')
        with page.expect_download() as received:
            workshop.get_by_role('button', name='Download calendar (.ics)', exact=True).click()
        download = received.value
        content = Path(download.path()).read_bytes()
        check('calendar contains stable ID and exact UTC time', b'UID:synthetic_opportunity_1@utsc-career-navigator' in content and b'DTSTART:20270314T160000Z' in content)
        check('calendar preserves CRLF and synthetic label', b'\r\n' in content and b'SYNTHETIC' in content)
        page.get_by_label('Show', exact=True).select_option('history')
        check('history is explicitly separate', page.locator('.opportunity-card').count() == 1 and 'Past competition' in page.locator('.opportunity-card').inner_text())
        page.get_by_role('button', name='Clear filters', exact=True).click()
        page.keyboard.press('Tab')
        page.evaluate("document.querySelector('.skip-link').focus()")
        page.keyboard.press('Enter')
        check('keyboard skip preserves route', '#/opportunities' in page.url and page.locator('#main-content').evaluate('(e) => e === document.activeElement'))
        for language in ['English', '中文']:
            page.get_by_role('button', name=language, exact=True).click()
            page.set_viewport_size({'width': 390, 'height': 844})
            for route in ['', 'market', 'compare', 'courses', 'pathways', 'opportunities']:
                page.goto(BASE + ('?lang=zh' if language == '中文' else '?lang=en') + '#/' + route)
                page.locator('h1').wait_for(); page.wait_for_timeout(200)
                check('390px no page overflow: ' + language + '/' + route, page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
            page.screenshot(path=str(OUT / ('opportunities-zh-390.png' if language == '中文' else 'opportunities-en-390.png')), full_page=True)
        page.goto(BASE + '?lang=en#/opportunities')
        page.locator('.opportunity-card').first.wait_for()
        page.screenshot(path=str(OUT / 'opportunities-en-desktop.png'), full_page=True)
        check('no page errors', not errors)
        browser.close()
except Exception as error:
    checks.append({'name': 'browser run completed', 'passed': False, 'message': str(error)})
finally:
    report = {'passed': sum(x['passed'] for x in checks), 'total': len(checks), 'checks': checks, 'page_errors': errors, 'scope': 'exact built public Worker; real browser; synthetic data; no account simulation'}
    (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'total': report['total'], 'page_errors': errors, 'failed': [x for x in checks if not x['passed']]}, ensure_ascii=False))
    if report['passed'] != report['total'] or errors:
        raise SystemExit(1)
