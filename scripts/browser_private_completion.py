"""Real local-account end-to-end flow. No simulated login or private-data fixtures."""
import json
import os
import re
import sys
import uuid
from pathlib import Path
import requests
from playwright.sync_api import sync_playwright

BASE = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:5198/'
URL = os.environ['UTSC_SUPABASE_URL']
assert URL == 'http://127.0.0.1:55421'
ADMIN = {'apikey': os.environ['UTSC_SUPABASE_SERVICE_ROLE_KEY'], 'Authorization': 'Bearer ' + os.environ['UTSC_SUPABASE_SERVICE_ROLE_KEY']}
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('artifacts/completion-20261102/private-browser')
OUT.mkdir(parents=True, exist_ok=False)
accounts, checks, errors = [], [], []

def check(name, value):
    checks.append({'name': name, 'passed': bool(value)})
    if not value:
        raise AssertionError(name)

def rows(table, uid):
    result = requests.get(URL + '/rest/v1/' + table, headers=ADMIN, params={'user_id' if table != 'profiles' else 'id': 'eq.' + uid, 'select': '*'}, timeout=15)
    result.raise_for_status()
    return result.json()

def create(label):
    account = {'email': 'utsc-completion-' + label + '-' + uuid.uuid4().hex + '@example.test', 'password': uuid.uuid4().hex + 'Aa2!'}
    result = requests.post(URL + '/auth/v1/admin/users', headers=ADMIN, json={**account, 'email_confirm': True}, timeout=15)
    result.raise_for_status(); account['uid'] = result.json()['id']; accounts.append(account)
    return account

def login(page, account):
    page.goto(BASE + '#/account')
    page.locator('input[type=email]').fill(account['email'])
    page.locator('input[type=password]').fill(account['password'])
    page.locator('form.account-form button[type=submit]').click()
    page.get_by_text('Signed in as', exact=False).wait_for()

def logout(page):
    page.goto(BASE + '#/account')
    page.get_by_role('button', name='Sign out', exact=True).click()
    page.locator('input[type=email]').wait_for()

try:
    a, b = create('a'), create('b')
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        page = context.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE + '#/market'); page.locator('h1').wait_for()
        check('anonymous can browse market', page.locator('input[type=password]').count() == 0)
        login(page, a)
        page.goto(BASE + '#/profile')
        page.get_by_role('heading', name='My experiences', exact=True).wait_for()
        page.locator('textarea').first.fill('I used Python.')
        page.get_by_role('button', name='Add experience', exact=True).click()
        page.get_by_text('Experience saved. No skill was confirmed automatically.', exact=True).wait_for()
        check('saving experience creates no automatic skill confirmation', rows('user_skills', a['uid']) == [])
        page.get_by_role('button', name='Confirm Python from this experience', exact=True).click()
        page.get_by_text('Skill confirmed explicitly.', exact=True).wait_for()
        check('explicit skill has the real experience source', len(rows('user_skills', a['uid'])) == 1 and rows('user_skills', a['uid'])[0]['source'] == 'experience')
        page.locator('textarea').first.fill('UNSAVED PRIVATE DRAFT')
        page.get_by_role('button', name='中文', exact=True).click()
        check('language switch preserves private draft', page.locator('textarea').first.input_value() == 'UNSAVED PRIVATE DRAFT')
        page.get_by_role('button', name='English', exact=True).click()
        page.goto(BASE + '#/pathways')
        page.get_by_role('radio', name=re.compile('^Data Analyst')).first.click()
        page.get_by_role('checkbox', name=re.compile('Python')).first.check()
        page.get_by_role('button', name='Save as learning path', exact=True).click()
        page.get_by_text('Learning path saved with', exact=False).wait_for()
        check('path and skill item persist in the physical database', len(rows('learning_paths', a['uid'])) == 1 and len(rows('path_items', a['uid'])) >= 1)
        page.get_by_role('button', name='Save to favorites', exact=True).first.click()
        page.get_by_role('button', name='Remove saved item', exact=True).first.wait_for()
        check('resource favorite is explicitly persisted', len(rows('favorites', a['uid'])) == 1 and rows('favorites', a['uid'])[0]['target_type'] == 'resource')
        page.goto(BASE + '#/opportunities')
        card = page.locator('.opportunity-card').filter(has_text='Python data workshop')
        card.get_by_role('button', name='Save to favorites', exact=True).click()
        card.get_by_role('button', name='Remove saved item', exact=True).wait_for()
        check('opportunity favorite persists independently', len(rows('favorites', a['uid'])) == 2)
        with page.expect_download() as received:
            card.get_by_role('button', name='Download calendar (.ics)', exact=True).click()
        check('signed-in end-to-end flow exports a real calendar file', b'BEGIN:VEVENT' in Path(received.value.path()).read_bytes())
        page.goto(BASE + '#/favorites')
        page.get_by_role('button', name='Remove saved item', exact=True).first.wait_for()
        check('both favorite types are visible', page.locator('article.panel').count() == 2)
        page.reload(); page.get_by_role('button', name='Remove saved item', exact=True).first.wait_for()
        check('favorites survive refresh', page.locator('article.panel').count() == 2)
        logout(page); login(page, b)
        page.goto(BASE + '#/favorites')
        page.get_by_text('No saved items yet.', exact=True).wait_for()
        check('B cannot see A favorites', page.locator('article.panel').count() == 0 and rows('favorites', b['uid']) == [])
        page.goto(BASE + '#/pathways')
        page.get_by_text('No saved learning paths yet.', exact=True).wait_for()
        check('B cannot see A paths', rows('learning_paths', b['uid']) == [])
        logout(page); login(page, a)
        page.goto(BASE + '#/favorites')
        page.get_by_role('button', name='Remove saved item', exact=True).first.wait_for()
        check('A login restores both saved items', page.locator('article.panel').count() == 2)
        # The most recent item is the opportunity; remove it, retain the resource.
        page.locator('article.panel').filter(has_text='synthetic_opportunity_1').get_by_role('button', name='Remove saved item', exact=True).click()
        page.wait_for_timeout(200)
        check('removal is immediate and affects only the selected favorite', len(rows('favorites', a['uid'])) == 1 and rows('favorites', a['uid'])[0]['target_type'] == 'resource')
        def removed_resource(route):
            response = route.fetch()
            bundle = response.json(); bundle['resources'] = []
            route.fulfill(response=response, json=bundle)
        page.route('**/demo/a4-pathways-demo.json', removed_resource)
        page.reload(); page.get_by_role('heading', name='Source unavailable', exact=True).wait_for()
        check('removed resource retains its saved record and explicit unavailable state', len(rows('favorites', a['uid'])) == 1)
        page.get_by_role('button', name='Remove saved item', exact=True).click()
        page.get_by_text('No saved items yet.', exact=True).wait_for()
        check('unavailable saved record can still be removed', rows('favorites', a['uid']) == [])
        page.unroute('**/demo/a4-pathways-demo.json', removed_resource)
        page.set_viewport_size({'width': 390, 'height': 844})
        for route in ['profile', 'favorites', 'pathways', 'opportunities']:
            page.goto(BASE + '#/' + route); page.locator('h1').wait_for(); page.wait_for_timeout(200)
            check('private 390px layout: ' + route, page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
        page.screenshot(path=str(OUT / 'signed-in-opportunities-390.png'), full_page=True)
        check('no browser page errors', not errors)
        browser.close()
except Exception as error:
    checks.append({'name': 'real private end-to-end completion', 'passed': False, 'message': str(error)})
finally:
    for account in accounts:
        try:
            response = requests.delete(URL + '/auth/v1/admin/users/' + account['uid'], headers=ADMIN, timeout=15)
            response.raise_for_status()
            clean = all(rows(table, account['uid']) == [] for table in ['profiles', 'experiences', 'user_skills', 'favorites', 'learning_paths', 'path_items'])
            checks.append({'name': 'unique temporary account cleanup', 'passed': clean})
        except Exception as error:
            checks.append({'name': 'unique temporary account cleanup', 'passed': False, 'message': str(error)})
    report = {'passed': sum(x['passed'] for x in checks), 'total': len(checks), 'checks': checks, 'page_errors': errors, 'scope': 'real local Auth and physical database; no cloud-account claim; source-removal response is controlled injection'}
    (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'total': report['total'], 'page_errors': errors, 'failed': [x for x in checks if not x['passed']]}, ensure_ascii=False))
    if report['passed'] != report['total'] or errors:
        raise SystemExit(1)
