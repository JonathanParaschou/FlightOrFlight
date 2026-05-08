from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
import pandas as pd
import uuid
import re

from db import init_db, save_flight_price


@dataclass
class Config:
    origin_code: str = "MSP"
    origin_text: str = "Minneapolis"

    destination_code: str = "HNL"
    destination_select_text: str = "Honolulu HNL"

    year: int = 2026
    trip_length_days: int = 4
    adults: int = 1

    debug_dir: str = "flight_scanner_debug"

    headless: bool = True
    slow_mo: int = 0

    min_valid_price: int = 100
    max_valid_price: int = 6000

    max_windows: int | None = None

    # 1 = safest. 2 or 3 = faster. Avoid going too high.
    max_workers: int = 2


def format_google_date(d: date) -> str:
    return f"{d.strftime('%B')} {d.day}, {d.year}"


def generate_trip_windows(
    year: int,
    trip_length_days: int,
    max_windows: int | None = None,
):
    today = date.today()

    if year < today.year:
        print(f"Year {year} is in the past. Nothing to scan.")
        return

    if year == today.year:
        current = today
    else:
        current = date(year, 1, 1)

    end = date(year, 12, 31)
    count = 0

    while current <= end:
        depart_date = current
        return_date = current + timedelta(days=trip_length_days)

        yield depart_date, return_date

        current += timedelta(days=1)
        count += 1

        if max_windows is not None and count >= max_windows:
            break


def maybe_accept_google_consent(page):
    for label in ["Accept all", "I agree", "Reject all"]:
        try:
            loc = page.get_by_text(label, exact=False)
            if loc.count() > 0 and loc.first.is_visible(timeout=1000):
                loc.first.click(timeout=3000)
                page.wait_for_timeout(700)
                return
        except Exception:
            pass


def save_debug(page, config: Config, depart_date: date, return_date: date, label: str):
    debug_path = Path(config.debug_dir)
    debug_path.mkdir(exist_ok=True)

    stamp = f"{depart_date.isoformat()}_{return_date.isoformat()}_{label}"

    try:
        page.screenshot(path=str(debug_path / f"{stamp}.png"), full_page=True)
    except Exception:
        pass

    try:
        html = page.content()
        body = page.locator("body").inner_text(timeout=10000)

        (debug_path / f"{stamp}.html").write_text(html, encoding="utf-8")
        (debug_path / f"{stamp}.txt").write_text(body, encoding="utf-8")
    except Exception:
        pass


def click_visible_text(page, text: str, exact: bool = False, timeout: int = 5000) -> bool:
    loc = page.get_by_text(text, exact=exact)

    for i in range(loc.count()):
        item = loc.nth(i)

        try:
            if item.is_visible(timeout=500):
                item.click(timeout=timeout)
                page.wait_for_timeout(400)
                return True
        except Exception:
            continue

    return False


def clear_and_type_into_focused(page, value: str):
    page.keyboard.press("Control+A")
    page.keyboard.press("Backspace")
    page.keyboard.type(value, delay=20)
    page.wait_for_timeout(500)


def fill_airport_input(page, locator, value: str):
    locator.fill(value, timeout=5000)
    page.wait_for_timeout(1500)


def type_airport_input(page, locator, value: str):
    locator.evaluate("element => element.focus()")
    locator.fill("", timeout=5000)
    page.keyboard.type(value, delay=50)
    page.wait_for_timeout(1500)


def select_airport_option(page, candidates: list[str]):
    clean_candidates = []
    page.wait_for_timeout(1000)

    for candidate in candidates:
        candidate = candidate.strip()
        if not candidate:
            continue
        clean_candidates.append(candidate)

        try:
            option = page.get_by_role("option").filter(has_text=candidate).first
            if option.is_visible(timeout=1500):
                option.click(timeout=5000)
                page.wait_for_timeout(800)
                return
        except Exception:
            pass

    raise RuntimeError(f"Could not find airport option for: {', '.join(clean_candidates)}")


def verify_airport_selection(page, code: str, text: str, label: str):
    page.wait_for_timeout(500)
    body = page.locator("body").inner_text(timeout=10000)

    if code in body or (text and text in body):
        print(f"{label} verified: {code}")
        return

    raise RuntimeError(
        f"{label} selection did not verify for {code}. "
        f"Visible page text: {body[:1000]}"
    )


def set_origin_if_needed(page, config: Config):
    print(f"Setting origin: {config.origin_code}")

    origin_input = page.locator('input[aria-label^="Where from?"]').first
    origin_input.wait_for(state="visible", timeout=15000)
    last_error = None

    for _ in range(2):
        try:
            fill_airport_input(page, origin_input, config.origin_code)
            select_airport_option(page, [config.origin_code, config.origin_text])
            verify_airport_selection(page, config.origin_code, config.origin_text, "Origin")
            break
        except Exception as error:
            last_error = error
            page.wait_for_timeout(1200)
    else:
        raise last_error

    print("Origin set.")


def set_destination(page, config: Config):
    print(f"Setting destination: {config.destination_code}")

    destination_input = page.locator('input[aria-label^="Where to?"]').first
    destination_input.wait_for(state="visible", timeout=15000)
    last_error = None

    for _ in range(2):
        try:
            destination_input = page.locator('input[aria-label^="Where to?"]').first
            destination_input.wait_for(state="visible", timeout=15000)
            type_airport_input(page, destination_input, config.destination_code)
            select_airport_option(
                page,
                [config.destination_code, config.destination_select_text],
            )
            verify_airport_selection(
                page,
                config.destination_code,
                config.destination_select_text,
                "Destination",
            )
            break
        except Exception as error:
            last_error = error
            page.wait_for_timeout(1200)
    else:
        raise last_error

    print("Destination set.")


def set_adults(page, config: Config):
    if config.adults <= 1:
        print("Adults set to 1. Skipping passenger selector.")
        return

    print(f"Setting adults: {config.adults}")

    try:
        passenger_button = page.get_by_text("1", exact=True).first
        passenger_button.click(timeout=3000)
        page.wait_for_timeout(700)
    except Exception:
        print("Could not open passenger selector. Continuing.")
        return

    needed_clicks = config.adults - 1

    for _ in range(needed_clicks):
        clicked = False
        buttons = page.get_by_role("button")

        for i in range(buttons.count()):
            b = buttons.nth(i)

            try:
                label = (b.get_attribute("aria-label") or "").lower()
                text = ""

                try:
                    text = b.inner_text(timeout=300).strip()
                except Exception:
                    pass

                if (
                    ("adult" in label and ("add" in label or "increase" in label))
                    or text == "+"
                ):
                    b.click(timeout=3000)
                    clicked = True
                    page.wait_for_timeout(400)
                    break

            except Exception:
                continue

        if not clicked:
            print("Could not find adult increment button.")
            break

    click_visible_text(page, "Done", exact=True, timeout=3000)
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)


def open_date_picker(page):
    print("Opening date picker.")

    departure_input = page.locator('input[aria-label="Departure"]').first
    departure_input.wait_for(state="visible", timeout=15000)
    departure_input.click(timeout=5000)

    page.wait_for_timeout(700)


def click_month_arrow(page, direction: str) -> bool:
    direction = direction.lower()

    if direction not in ["next", "previous"]:
        raise ValueError("direction must be 'next' or 'previous'")

    buttons = page.get_by_role("button")

    if direction == "next":
        keywords = ["next", "next month"]
    else:
        keywords = ["previous", "prev", "previous month"]

    for i in range(buttons.count()):
        button = buttons.nth(i)

        try:
            label = (button.get_attribute("aria-label") or "").lower()

            if any(k in label for k in keywords):
                if button.is_visible(timeout=500):
                    button.click(timeout=5000)
                    page.wait_for_timeout(500)
                    return True

        except Exception:
            continue

    if direction == "next":
        page.keyboard.press("PageDown")
    else:
        page.keyboard.press("PageUp")

    page.wait_for_timeout(500)
    return True


def get_visible_calendar_text(page) -> str:
    try:
        return page.locator("body").inner_text(timeout=5000)
    except Exception:
        return ""


def click_date_with_month_navigation(page, target_date: date, max_month_clicks: int = 18) -> bool:
    target_label = format_google_date(target_date)
    target_month = target_date.strftime("%B")
    target_year = str(target_date.year)
    target_day = str(target_date.day)

    print(f"Selecting date: {target_label}")

    for _ in range(max_month_clicks):
        try:
            loc = page.get_by_label(target_label, exact=False)

            for i in range(loc.count()):
                item = loc.nth(i)

                if item.is_visible(timeout=700):
                    item.click(timeout=5000)
                    page.wait_for_timeout(500)
                    return True

        except Exception:
            pass

        body = get_visible_calendar_text(page)

        if target_month in body and target_year in body:
            try:
                day_candidates = page.get_by_text(target_day, exact=True)

                for i in range(day_candidates.count()):
                    item = day_candidates.nth(i)

                    if item.is_visible(timeout=700):
                        item.click(timeout=5000)
                        page.wait_for_timeout(500)
                        return True

            except Exception:
                pass

        today = date.today()

        if target_date < today:
            click_month_arrow(page, "previous")
        else:
            click_month_arrow(page, "next")

    return False


def set_dates(page, depart_date: date, return_date: date):
    print(f"Setting dates: {depart_date} -> {return_date}")

    open_date_picker(page)

    if not click_date_with_month_navigation(page, depart_date):
        raise RuntimeError(f"Could not select departure date: {depart_date}")

    if not click_date_with_month_navigation(page, return_date):
        raise RuntimeError(f"Could not select return date: {return_date}")

    try:
        done_button = page.locator('button[aria-label^="Done. Search"]').first
        done_button.click(timeout=10000)
    except Exception:
        if not click_visible_text(page, "Done", exact=True, timeout=5000):
            page.keyboard.press("Escape")

    page.wait_for_timeout(1000)
    print("Dates set.")


def click_search(page):
    print("Clicking Search.")

    try:
        search_button = page.get_by_role("button", name="Search").first
        search_button.click(timeout=10000)
        page.wait_for_timeout(2500)
        return
    except Exception:
        pass

    try:
        page.locator('button:has-text("Search")').first.click(timeout=10000)
        page.wait_for_timeout(2500)
        return
    except Exception:
        pass

    print("Could not click Search. Continuing to extract visible route price.")


def parse_price_value(match: str, config: Config):
    try:
        price = int(match.replace(",", ""))
        if config.min_valid_price <= price <= config.max_valid_price:
            return price
    except ValueError:
        pass

    return None


def parse_duration_minutes(text: str) -> int | None:
    durations = []

    for hours, minutes in re.findall(
        r"(\d{1,2})\s*hr(?:\s*(\d{1,2})\s*min)?",
        text,
        flags=re.IGNORECASE,
    ):
        total = int(hours) * 60
        if minutes:
            total += int(minutes)
        durations.append(total)

    plausible = [minutes for minutes in durations if 30 <= minutes <= 48 * 60]
    return min(plausible) if plausible else None


def extract_route_price(page, config: Config):
    body = page.locator("body").inner_text(timeout=15000)
    normalized = body.replace("\u00a0", " ")

    prices = []

    cheapest_matches = re.findall(
        r"Cheapest\s+from\s+\$([0-9]{1,3}(?:,[0-9]{3})*|[0-9]{2,5})",
        normalized,
        flags=re.IGNORECASE,
    )

    for match in cheapest_matches:
        price = parse_price_value(match, config)
        if price is not None:
            prices.append(price)

    if prices:
        context_text = normalized[:4000]
        return min(prices), parse_duration_minutes(context_text), context_text

    round_trip_matches = re.findall(
        r"\$([0-9]{1,3}(?:,[0-9]{3})*|[0-9]{2,5})\s+round trip",
        normalized,
        flags=re.IGNORECASE,
    )

    for match in round_trip_matches:
        price = parse_price_value(match, config)
        if price is not None:
            prices.append(price)

    if prices:
        context_text = normalized[:4000]
        return min(prices), parse_duration_minutes(context_text), context_text

    explore_matches = re.findall(
        r"Explore flights\s+from\s+\$([0-9]{1,3}(?:,[0-9]{3})*|[0-9]{2,5})",
        normalized,
        flags=re.IGNORECASE,
    )

    for match in explore_matches:
        price = parse_price_value(match, config)
        if price is not None:
            prices.append(price)

    if prices:
        context_text = normalized[-3000:]
        return min(prices), parse_duration_minutes(context_text), context_text

    lower = normalized.lower()
    idx = lower.find("top departing flights")

    if idx != -1:
        results_section = normalized[idx:idx + 6000]

        fallback_matches = re.findall(
            r"\$([0-9]{1,3}(?:,[0-9]{3})*|[0-9]{2,5})",
            results_section,
        )

        for match in fallback_matches:
            price = parse_price_value(match, config)
            if price is not None:
                prices.append(price)

        if prices:
            context_text = results_section[:4000]
            return min(prices), parse_duration_minutes(context_text), context_text

        context_text = results_section[:4000]
        return None, parse_duration_minutes(context_text), context_text

    context_text = normalized[-4000:]
    return None, parse_duration_minutes(context_text), context_text


def fill_form_and_search(page, config: Config, depart_date: date, return_date: date):
    page.goto("https://www.google.com/travel/flights", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(2000)

    maybe_accept_google_consent(page)

    set_origin_if_needed(page, config)
    set_destination(page, config)
    set_adults(page, config)
    set_dates(page, depart_date, return_date)
    click_search(page)

    page.wait_for_timeout(500)

def build_row(
    config: Config,
    scan_id: str,
    depart_date: date,
    return_date: date,
    status: str = "unknown",
    price: int | None = None,
    total_duration_minutes: int | None = None,
    deal_url: str | None = None,
    raw_context: str | None = None,
):
    return {
        "scan_id": scan_id,
        "scanned_at": pd.Timestamp.now().isoformat(),
        "origin": config.origin_code.upper(),
        "destination": config.destination_code.upper(),
        "depart_date": depart_date.isoformat(),
        "return_date": return_date.isoformat(),
        "trip_length_days": config.trip_length_days,
        "adults": config.adults,
        "cheapest_price_usd": price,
        "total_duration_minutes": total_duration_minutes,
        "deal_url": deal_url,
        "status": status,
        "raw_context": raw_context[:3000] if raw_context else None,
    }


def scan_one_window(config: Config, scan_id: str, depart_date: date, return_date: date):
    row = build_row(config, scan_id, depart_date, return_date)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=config.headless,
            slow_mo=config.slow_mo,
        )

        context = browser.new_context(
            viewport={"width": 1600, "height": 1000},
            locale="en-US",
        )

        page = context.new_page()

        try:
            fill_form_and_search(page, config, depart_date, return_date)

            price, total_duration_minutes, context_text = extract_route_price(page, config)
            deal_url = page.url

            if price is None:
                row = build_row(
                    config=config,
                    scan_id=scan_id,
                    depart_date=depart_date,
                    return_date=return_date,
                    status="no_route_price_found",
                    price=None,
                    total_duration_minutes=total_duration_minutes,
                    deal_url=deal_url,
                    raw_context=context_text,
                )
                # save_debug(page, config, depart_date, return_date, "no_price")
            else:
                row = build_row(
                    config=config,
                    scan_id=scan_id,
                    depart_date=depart_date,
                    return_date=return_date,
                    status="success",
                    price=price,
                    total_duration_minutes=total_duration_minutes,
                    deal_url=deal_url,
                    raw_context=context_text,
                )

        except PlaywrightTimeoutError as e:
            row = build_row(
                config=config,
                scan_id=scan_id,
                depart_date=depart_date,
                return_date=return_date,
                status="timeout",
                price=None,
                raw_context=str(e),
            )
            # save_debug(page, config, depart_date, return_date, "timeout")

        except Exception as e:
            row = build_row(
                config=config,
                scan_id=scan_id,
                depart_date=depart_date,
                return_date=return_date,
                status=f"error: {type(e).__name__}",
                price=None,
                raw_context=str(e),
            )
            # save_debug(page, config, depart_date, return_date, "error")

        finally:
            browser.close()

    return row


def persist_result(config: Config, row: dict):
    save_flight_price(row)


def scan_year(config: Config):
    init_db()

    scan_id = str(uuid.uuid4())

    windows = list(
        generate_trip_windows(
            year=config.year,
            trip_length_days=config.trip_length_days,
            max_windows=config.max_windows,
        )
    )

    total = len(windows)

    print(f"Scan ID: {scan_id}")
    print(f"Scanning {total} windows.")
    print(f"Route: {config.origin_code.upper()} -> {config.destination_code.upper()}")
    print(f"Trip length: {config.trip_length_days} days")
    print(f"Adults: {config.adults}")
    print(f"Headless: {config.headless}")
    print(f"Workers: {config.max_workers}")

    if config.max_workers <= 1:
        for idx, (depart_date, return_date) in enumerate(windows, start=1):
            print("\n" + "=" * 80)
            print(f"[{idx}/{total}] {depart_date} -> {return_date}")
            print("=" * 80)

            try:
                row = scan_one_window(config, scan_id, depart_date, return_date)
                persist_result(config, row)

                if row["cheapest_price_usd"] is not None:
                    print(f"Found route price: ${row['cheapest_price_usd']}")
                else:
                    print(f"No price found. Status: {row['status']}")

            except KeyboardInterrupt:
                print("\nInterrupted. Exiting.")
                break

        print("\nDone.")
        return

    with ThreadPoolExecutor(max_workers=config.max_workers) as executor:
        future_map = {}

        for depart_date, return_date in windows:
            future = executor.submit(scan_one_window, config, scan_id, depart_date, return_date)
            future_map[future] = (depart_date, return_date)

        completed = 0

        for future in as_completed(future_map):
            depart_date, return_date = future_map[future]
            completed += 1

            print("\n" + "=" * 80)
            print(f"[{completed}/{total}] Completed {depart_date} -> {return_date}")
            print("=" * 80)

            try:
                row = future.result()
                persist_result(config, row)

                if row["cheapest_price_usd"] is not None:
                    print(f"Found route price: ${row['cheapest_price_usd']}")
                else:
                    print(f"No price found. Status: {row['status']}")

            except KeyboardInterrupt:
                print("\nInterrupted. Exiting.")
                break

            except Exception as e:
                print(f"Worker failed for {depart_date} -> {return_date}: {e}")

    print("\nDone.")


if __name__ == "__main__":
    config = Config(
        origin_code="MSP",
        origin_text="Minneapolis",

        destination_code="DAD",
        destination_select_text="Danang International Airport DAD",

        year=2026,
        trip_length_days=4,
        adults=1,

        debug_dir="flight_scanner_debug",

        headless=True,
        slow_mo=0,

        min_valid_price=100,
        max_valid_price=6000,

        max_windows=None,

        max_workers=10,
    )

    scan_year(config)
