"""Real-browser verification of bilingual navigation and session preservation."""
from pathlib import Path
import argparse
import csv
import io
import json
import os
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", required=True)
    parser.add_argument("--maintenance-url")
    args = parser.parse_args()
    output = ROOT / "artifacts/recovery-20261027" / args.run
    output.mkdir(parents=True, exist_ok=False)
    cached_browser = ROOT / ".cache/ms-playwright"
    if "PLAYWRIGHT_BROWSERS_PATH" not in os.environ and cached_browser.is_dir():
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(cached_browser)
    result = {"checks": [], "page_errors": [], "console_errors": [], "external_requests": [], "screenshots": []}
    def check(name):
        result["checks"].append(name)
        print("PASS " + name, flush=True)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=["--disable-background-networking"])
            context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
            def route_request(route):
                if urlparse(route.request.url).hostname not in {"127.0.0.1", None}:
                    result["external_requests"].append(route.request.url)
                    route.abort()
                else: route.continue_()
            context.route("**/*", route_request)
            page = context.new_page()
            page.on("pageerror", lambda error: result["page_errors"].append(str(error)))
            page.on("console", lambda message: result["console_errors"].append(message.text) if message.type == "error" else None)
            def ready(heading):
                expect(page.get_by_role("heading", name=heading, exact=True).first).to_be_visible(timeout=30000)
                expect(page.get_by_test_id("stException")).to_have_count(0)
                page.wait_for_timeout(250)
            def navigate(name, heading=None):
                page.get_by_role("radio", name=name, exact=True).locator("xpath=ancestor::label[1]").click()
                ready(heading or name)
            def toggle(to):
                page.get_by_role("button", name="English" if to == "en" else "中文", exact=True).click()
                expect(page.get_by_role("heading", name="Explore career directions" if to == "en" else "探索职业方向", exact=True)).to_be_visible()
                expect(page).to_have_url(__import__("re").compile(r"lang=" + to))
                page.wait_for_timeout(400)
            def select(label, option):
                page.wait_for_timeout(600)
                expect(page.get_by_test_id("stStatusWidget")).not_to_be_visible(timeout=20000)
                control = page.get_by_role("combobox", name=label, exact=True)
                control.scroll_into_view_if_needed()
                control.click()
                control.fill(option)
                control.press("ArrowDown")
                try:
                    page.get_by_role("option", name=option, exact=True).click(timeout=5000)
                except Exception:
                    print("SELECT DIAGNOSTIC", label, option, "visible options", page.get_by_role("option").all_text_contents(), flush=True)
                    page.screenshot(path=str(output / "selection-failure.png"), full_page=True)
                    (output / "selection-failure.txt").write_text(page.locator("body").inner_text(), encoding="utf-8")
                    raise
                page.wait_for_timeout(350)
            def metric(label, value):
                locator = page.get_by_test_id("stMetric").filter(has=page.get_by_text(label, exact=True)).get_by_test_id("stMetricValue")
                expect(locator).to_have_text(str(value), timeout=20000)
            def shot(name):
                page.screenshot(path=str(output / name), full_page=True, mask=[page.locator("textarea")])
                result["screenshots"].append(name)
            def download(label, filename):
                with page.expect_download() as event:
                    page.get_by_role("button", name=label, exact=True).click()
                item = event.value
                assert item.failure() is None
                item.save_as(output / filename)
                page.wait_for_timeout(900)
                expect(page.get_by_test_id("stStatusWidget")).not_to_be_visible(timeout=20000)
                return (output / filename).read_bytes()
            page.goto("http://127.0.0.1:8510")
            ready("探索职业方向")
            metric("纳入岗位数 F", 10)
            metric("可分析描述数 D", 8)
            expect(page.get_by_text("技能提及率（%）", exact=True)).to_be_visible()
            shot("overview-zh.png")
            check("Chinese overview, chart labels and F10/D8")
            toggle("en")
            metric("Admitted jobs F", 10)
            metric("Usable descriptions D", 8)
            expect(page.get_by_text("Mention rate (%)", exact=True)).to_be_visible()
            shot("overview-en.png")
            check("One-click English overview and matching chart values")
            select("Area", "Montreal Metro")
            metric("Admitted jobs F", 0)
            toggle("zh")
            metric("纳入岗位数 F", 0)
            expect(page.get_by_role("combobox", name="地区", exact=True)).to_have_value("蒙特利尔都会区")
            check("Area filter and empty state survive language switch")
            page.get_by_role("button", name="重置筛选", exact=True).click()
            metric("纳入岗位数 F", 10)
            navigate("职业方向比较")
            metric("左侧 · 纳入岗位数 F", 6)
            metric("右侧 · 纳入岗位数 F", 4)
            zh_csv = download("下载比较结果 CSV", "comparison-zh.csv")
            rows = list(csv.DictReader(io.StringIO(zh_csv.decode("utf-8-sig"))))
            sql = next(row for row in rows if row["skill_id"] == "sql")
            assert sql["left_D"] == "4" and sql["right_D"] == "4"
            toggle("en")
            en_csv = download("Download comparison CSV", "comparison-en.csv")
            assert zh_csv == en_csv
            check("Comparison values and machine-readable CSV unchanged across languages")
            select("Left role", "Data Engineer")
            metric("Left · Usable descriptions D", 0)
            expect(page.get_by_text("Left sample: no analyzable descriptions. Mention rates and dependent differences are N/A.", exact=True)).to_be_visible()
            toggle("zh")
            metric("左侧 · 可分析描述数 D", 0)
            expect(page.get_by_role("combobox", name="左侧职业方向", exact=True)).to_have_value("数据工程师")
            check("Comparison role choices and zero-denominator warning preserved")
            select("左侧职业方向", "商业智能分析师")
            expect(page.get_by_text("请选择两个不同的职业方向；方向相同时不显示比较结果或下载。", exact=True)).to_be_visible()
            expect(page.get_by_role("button", name="下载比较结果 CSV", exact=True)).to_have_count(0)
            select("左侧职业方向", "数据分析师")
            check("Identical-role guard remains functional")
            navigate("我的技能与下一步")
            personal = "Market overview\n我的课程记录 SQL; `literal`"
            page.get_by_role("textbox", name="已学课程（选填）", exact=True).fill(personal)
            page.get_by_role("textbox", name="项目或志愿经历（选填）", exact=True).fill("My local project / 我的项目")
            page.get_by_role("checkbox", name="我想练习 SQL", exact=True).locator("xpath=ancestor::label[1]").click()
            select("Python 自述", "实践过（自述）")
            page.get_by_role("button", name="生成下一步建议", exact=True).click()
            ready("下一步建议")
            zh_markdown = download("下载行动建议 Markdown", "actions-zh.md").decode("utf-8")
            assert personal in zh_markdown and "## 用户自述" in zh_markdown
            toggle("en")
            ready("Next steps")
            expect(page.get_by_role("radio", name="My skills & next steps", exact=True)).to_be_checked()
            expect(page.get_by_role("textbox", name="Courses studied (optional)", exact=True)).to_have_value(personal)
            expect(page.get_by_role("checkbox", name="I want to practise SQL", exact=True)).to_be_checked()
            expect(page.get_by_role("combobox", name="Python self-report", exact=True)).to_have_value("Practised (self-report)")
            en_markdown = download("Download actions Markdown", "actions-en.md").decode("utf-8")
            assert personal in en_markdown and "## User self-report" in en_markdown
            shot("profile-en.png")
            check("Profile text, skill choices, generated results and downloads survive toggle")
            toggle("zh")
            ready("下一步建议")
            shot("profile-zh.png")
            check("Chinese action headings and reasons")
            navigate("课程与实践")
            expect(page.get_by_text("暂无经过核实的精选机会，未虚构活动日期或招募信息。", exact=True)).to_be_visible()
            select("学习难度", "入门")
            page.get_by_role("checkbox", name="显示待核对入口", exact=True).locator("xpath=ancestor::label[1]").click()
            toggle("en")
            ready("Courses & practice")
            expect(page.get_by_role("combobox", name="Learning level", exact=True)).to_have_value("Beginner")
            expect(page.get_by_role("checkbox", name="Show entries awaiting verification", exact=True)).to_be_checked()
            shot("resources-en.png")
            check("Resource filters and explicit no-opportunity state in both languages")
            toggle("zh")
            shot("resources-zh.png")
            navigate("数据与质量")
            for tab in ("质量报告", "技能统计核对", "版本与来源"):
                page.get_by_role("tab", name=tab, exact=True).click()
                expect(page.get_by_test_id("stException")).to_have_count(0)
            toggle("en")
            for tab in ("Quality report", "Skill audit", "Release & sources"):
                page.get_by_role("tab", name=tab, exact=True).click()
                expect(page.get_by_test_id("stException")).to_have_count(0)
            shot("quality-en.png")
            check("Data quality tabs and raw provenance remain accessible")
            page.reload()
            ready("Explore career directions")
            expect(page.get_by_role("button", name="中文", exact=True)).to_be_visible()
            check("Language persists through browser reload via URL")
            page.get_by_role("radio", name="HISTORICAL", exact=True).locator("xpath=ancestor::label[1]").click()
            ready("No published version loaded")
            toggle("zh")
            ready("尚未加载已发布版本")
            expect(page.get_by_text("历史数据（HISTORICAL）· 尚未接入真实招聘批次，不会用模拟数据替代。", exact=True)).to_be_visible()
            check("Historical mode never falls back to synthetic data in either language")
            page.get_by_role("radio", name="模拟数据（SYNTHETIC）", exact=True).locator("xpath=ancestor::label[1]").click()
            ready("市场概览")
            metric("纳入岗位数 F", 10)
            page.set_viewport_size({"width": 390, "height": 844})
            page.wait_for_timeout(500)
            if page.get_by_test_id("stSidebar").get_attribute("aria-expanded") == "false":
                page.get_by_test_id("stExpandSidebarButton").click()
            toggle("en")
            toggle("zh")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 2")
            shot("mobile-zh.png")
            check("390px mobile toggle and page width")
            page.get_by_role("button", name="English", exact=True).focus()
            page.keyboard.press("Enter")
            expect(page.get_by_role("button", name="中文", exact=True)).to_be_visible()
            check("Language button supports keyboard activation")
            if args.maintenance_url:
                page.set_viewport_size({"width": 1440, "height": 1000})
                page.goto(args.maintenance_url)
                ready("探索职业方向")
                navigate("本地维护")
                expect(page.get_by_role("button", name="保存草稿来源", exact=True)).to_be_visible()
                toggle("en")
                ready("Local maintenance")
                expect(page.get_by_role("button", name="Save draft sources", exact=True)).to_be_visible()
                expect(page.get_by_role("button", name="Save review", exact=True)).to_be_visible()
                expect(page.get_by_role("button", name="Publish complete version", exact=True)).to_be_visible()
                shot("maintenance-en.png")
                check("Maintenance controls localized without saving or publishing edits")
            assert not result["page_errors"], result["page_errors"]
            assert not result["console_errors"], result["console_errors"]
            assert not result["external_requests"], result["external_requests"]
            result["passed"] = True
            browser.close()
    except Exception as error:
        result["passed"] = False
        result["failure"] = repr(error)
        raise
    finally:
        (output / "browser-check.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__": main()
