# backend/api/results.py
import io
from pathlib import Path
import pandas as pd
from datetime import datetime
from flask import Blueprint, jsonify, send_file

results_bp = Blueprint("results", __name__, url_prefix="/api/visual")



# HELPERS — LOADING CSVs
def load_plan_for_scenario(scenario: str):
    base = Path("scenarios") / scenario / "output"
    plan_csv = base / "plan.csv"

    if not plan_csv.exists():
        return None, f"plan.csv not found for scenario '{scenario}'"

    try:
        df = pd.read_csv(plan_csv)
        return df, None
    except Exception as e:
        return None, f"Failed to read plan.csv: {e}"


def load_late_for_scenario(scenario: str):
    base = Path("scenarios") / scenario / "output"
    late_csv = base / "late.csv"

    if not late_csv.exists():
        return None, f"late.csv not found for scenario '{scenario}'"

    try:
        df = pd.read_csv(late_csv)
        return df, None
    except Exception as e:
        return None, f"Failed to read late.csv: {e}"



# DATE PARSER
def parse_any_date(value):

    if value is None:
        return None

    text = str(value).strip()
    if text == "":
        return None

    formats = [
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y %H:%M",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
    ]

    # Try our formats first
    for fmt in formats:
        try:
            dt = datetime.strptime(text, fmt)
            return dt.strftime("%Y-%m-%dT%H:%M:%S")
        except:
            pass

    # Fallback: pandas flexible parser
    try:
        dt = pd.to_datetime(text, errors="coerce", dayfirst=True)
        if pd.notna(dt):
            return dt.strftime("%Y-%m-%dT%H:%M:%S")
    except:
        pass

    return None



# SANITIZERS
def sanitize(df: pd.DataFrame):
    """Convert datetime columns to ISO + convert NaN → None."""
    df = df.copy()
    date_columns = ["Start", "End", "LatestStartDate"]

    for col in date_columns:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")
            df[col] = df[col].apply(
                lambda x: x.strftime("%Y-%m-%dT%H:%M:%S") if pd.notna(x) else None
            )

    return df.where(pd.notna(df), None).to_dict(orient="records")


def sanitize_late(df: pd.DataFrame):
    df = df.copy()
    date_columns = ["Start", "End", "LatestStartDate", "Allowed"]

    for col in date_columns:
        if col in df.columns:
            df[col] = pd.to_datetime(
                df[col],
                format="%Y-%m-%d %H:%M:%S",
                errors="coerce"
            ).dt.strftime("%Y-%m-%dT%H:%M:%S")

    return df.where(pd.notna(df), None).to_dict(orient="records")




# PLAN TABLE JSON API
def make_machine_view(df: pd.DataFrame):
    df = df.copy()
    if "WorkPlaceNo" in df.columns and "Start" in df.columns:
        df["Start"] = pd.to_datetime(df["Start"], errors="coerce")
        df = df.sort_values(["WorkPlaceNo", "Start"], na_position="last")
    return df


def make_order_view(df: pd.DataFrame):
    df = df.copy()
    if "OrderNo" in df.columns and "OrderPos" in df.columns:
        df = df.sort_values(["OrderNo", "OrderPos"])
    return df


@results_bp.get("/<scenario>/plan-table")
def plan_table_json(scenario):
    df, err = load_plan_for_scenario(scenario)
    if err:
        return jsonify({"ok": False, "error": err}), 404

    if df.empty:
        return jsonify({"ok": True, "machine_view": [], "order_view": []})

    machine_df = make_machine_view(df)
    order_df = make_order_view(df)

    return jsonify({
        "ok": True,
        "scenario": scenario,
        "machine_view": sanitize(machine_df),
        "order_view": sanitize(order_df)
    })


# LATE OPS TABLE JSON API
@results_bp.get("/<scenario>/late-table")
def late_table_json(scenario):
    df, err = load_late_for_scenario(scenario)
    if err:
        return jsonify({"ok": False, "error": err}), 404

    if df.empty:
        return jsonify({"ok": True, "scenario": scenario, "rows": []})

    rows = sanitize_late(df)
    return jsonify({"ok": True, "scenario": scenario, "rows": rows})



# EXCEL EXPORTS
@results_bp.get("/<scenario>/plan-excel")
def plan_excel_download(scenario):
    df, err = load_plan_for_scenario(scenario)
    if err:
        return jsonify({"ok": False, "error": err}), 404

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        workbook = writer.book
        header_fmt = workbook.add_format(
            {"bold": True, "bg_color": "#DCE6F1", "border": 1}
        )

        machine_df = make_machine_view(df)
        machine_df.to_excel(writer, sheet_name="Machine View", index=False)
        ws1 = writer.sheets["Machine View"]
        for i, col in enumerate(machine_df.columns):
            ws1.write(0, i, col, header_fmt)
            ws1.set_column(i, i, 20)
        ws1.autofilter(0, 0, len(machine_df), len(machine_df.columns) - 1)

        order_df = make_order_view(df)
        order_df.to_excel(writer, sheet_name="Order View", index=False)
        ws2 = writer.sheets["Order View"]
        for i, col in enumerate(order_df.columns):
            ws2.write(0, i, col, header_fmt)
            ws2.set_column(i, i, 20)
        ws2.autofilter(0, 0, len(order_df), len(order_df.columns) - 1)

    output.seek(0)

    return send_file(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=f"{scenario}_plan.xlsx"
    )


@results_bp.get("/<scenario>/late-excel")
def late_excel_download(scenario):
    df, err = load_late_for_scenario(scenario)
    if err:
        return jsonify({"ok": False, "error": err}), 404

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        workbook = writer.book
        header_fmt = workbook.add_format(
            {"bold": True, "bg_color": "#DCE6F1", "border": 1}
        )

        df.to_excel(writer, sheet_name="Late Ops", index=False)
        ws = writer.sheets["Late Ops"]
        for i, col in enumerate(df.columns):
            ws.write(0, i, col, header_fmt)
            ws.set_column(i, i, 20)
        ws.autofilter(0, 0, len(df), len(df.columns) - 1)

    output.seek(0)

    return send_file(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=f"{scenario}_late_ops.xlsx",
    )

def load_missing_rt10(scenario: str):
    base = Path("scenarios") / scenario / "cleaned"
    f = base / "orders_no_recordtype10.csv"

    if not f.exists():
        return None, f"{f.name} not found for scenario '{scenario}'"

    try:
        df = pd.read_csv(f)
        df = df.where(pd.notna(df), None)
        return df, None
    except Exception as e:
        return None, f"Failed to read missing-rt10 CSV: {e}"

def load_shift_injections(scenario: str):
    base = Path("scenarios") / scenario / "cleaned"
    f = base / "shifts_injection_log.csv"

    if not f.exists():
        return None, f"{f.name} not found for scenario '{scenario}'"

    try:
        df = pd.read_csv(f)
        df = df.where(pd.notna(df), None)
        return df, None
    except Exception as e:
        return None, f"Failed to read shift injection CSV: {e}"



@results_bp.get("/<scenario>/missing-rt10")
def missing_rt10_table(scenario):
    df, err = load_missing_rt10(scenario)
    if err:
        return jsonify({"ok": False, "error": err}), 404

    if df.empty:
        return jsonify({"ok": True, "scenario": scenario, "rows": []})

    rows = df.to_dict(orient="records")
    return jsonify({"ok": True, "scenario": scenario, "rows": rows})

@results_bp.get("/<scenario>/missing-rt10-excel")
def missing_rt10_excel(scenario):
    df, err = load_missing_rt10(scenario)
    if err:
        return jsonify({"ok": False, "error": err}), 404

    output = io.BytesIO()

    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        workbook = writer.book
        header_fmt = workbook.add_format(
            {"bold": True, "bg_color": "#DCE6F1", "border": 1}
        )

        df.to_excel(writer, sheet_name="Missing RT10", index=False)
        ws = writer.sheets["Missing RT10"]

        for i, col in enumerate(df.columns):
            ws.write(0, i, col, header_fmt)
            ws.set_column(i, i, 22)

        ws.autofilter(0, 0, len(df), len(df.columns) - 1)

    output.seek(0)

    return send_file(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        download_name=f"{scenario}_missing_rt10.xlsx",
        as_attachment=True,
    )

@results_bp.get("/<scenario>/shift-injections")
def shift_injections_table(scenario):
    df, err = load_shift_injections(scenario)
    if err:
        return jsonify({"ok": False, "error": err}), 404

    if df.empty:
        return jsonify({"ok": True, "scenario": scenario, "rows": []})

    # Convert datetime-like fields if present
    for col in ["injected_start", "injected_end"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")
            df[col] = df[col].apply(
                lambda x: x.strftime("%Y-%m-%dT%H:%M:%S") if pd.notna(x) else None
            )

    rows = df.to_dict(orient="records")
    return jsonify({"ok": True, "scenario": scenario, "rows": rows})

@results_bp.get("/<scenario>/shift-injections-excel")
def shift_injections_excel(scenario):
    df, err = load_shift_injections(scenario)
    if err:
        return jsonify({"ok": False, "error": err}), 404

    output = io.BytesIO()

    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        workbook = writer.book
        header_fmt = workbook.add_format(
            {"bold": True, "bg_color": "#DCE6F1", "border": 1}
        )

        df.to_excel(writer, sheet_name="Shift Injections", index=False)
        ws = writer.sheets["Shift Injections"]

        for i, col in enumerate(df.columns):
            ws.write(0, i, col, header_fmt)
            ws.set_column(i, i, 22)

        ws.autofilter(0, 0, len(df), len(df.columns) - 1)

    output.seek(0)

    return send_file(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        download_name=f"{scenario}_shift_injections.xlsx",
        as_attachment=True,
    )

# UNPLACED JOBS (output/unplaced.csv)
def load_unplaced(scenario: str):
    base = Path("scenarios") / scenario / "output"
    f = base / "unplaced.csv"

    if not f.exists():
        return None, f"{f.name} not found for scenario '{scenario}'"

    try:
        df = pd.read_csv(f)
        df = df.where(pd.notna(df), None)
        return df, None
    except Exception as e:
        return None, f"Failed to read unplaced.csv: {e}"


@results_bp.get("/<scenario>/unplaced")
def unplaced_table(scenario):
    df, err = load_unplaced(scenario)
    if err:
        return jsonify({"ok": False, "error": err}), 404

    if df.empty:
        return jsonify({"ok": True, "scenario": scenario, "rows": []})

    # Convert LatestStartDate ISO -> consistent format
    if "LatestStartDate" in df.columns:
        df["LatestStartDate"] = pd.to_datetime(
            df["LatestStartDate"], errors="coerce"
        ).dt.strftime("%Y-%m-%dT%H:%M:%S")

    rows = df.where(pd.notna(df), None).to_dict(orient="records")
    return jsonify({"ok": True, "scenario": scenario, "rows": rows})


@results_bp.get("/<scenario>/unplaced-excel")
def unplaced_excel(scenario):
    df, err = load_unplaced(scenario)
    if err:
        return jsonify({"ok": False, "error": err}), 404

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        workbook = writer.book
        header_fmt = workbook.add_format(
            {"bold": True, "bg_color": "#DCE6F1", "border": 1}
        )

        df.to_excel(writer, sheet_name="Unplaced", index=False)
        ws = writer.sheets["Unplaced"]

        for i, col in enumerate(df.columns):
            ws.write(0, i, col, header_fmt)
            ws.set_column(i, i, 25)

        ws.autofilter(0, 0, len(df), len(df.columns) - 1)

    output.seek(0)

    return send_file(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        download_name=f"{scenario}_unplaced.xlsx",
        as_attachment=True,
    )


def load_delivery_for_scenario(scenario: str):
    base = Path("scenarios") / scenario / "output"
    f = base / "orders_delivery.csv"

    if not f.exists():
        return None, f"{f.name} not found for scenario '{scenario}'"

    try:
        df = pd.read_csv(f)
        df["SupposedDeliveryDate"] = pd.to_datetime(df["SupposedDeliveryDate"], errors="coerce")
        df["DeliveryAfterScheduling"] = pd.to_datetime(df["DeliveryAfterScheduling"], errors="coerce")

        # convert to ISO
        df["SupposedDeliveryDate"] = df["SupposedDeliveryDate"].apply(
            lambda x: x.strftime("%Y-%m-%dT%H:%M:%S") if pd.notna(x) else None
        )
        df["DeliveryAfterScheduling"] = df["DeliveryAfterScheduling"].apply(
            lambda x: x.strftime("%Y-%m-%dT%H:%M:%S") if pd.notna(x) else None
        )

        df = df.where(pd.notna(df), None)
        return df, None

    except Exception as e:
        return None, f"Failed to read orders_delivery.csv: {e}"


@results_bp.get("/<scenario>/delivery-table")
def delivery_table(scenario):
    df, err = load_delivery_for_scenario(scenario)
    if err:
        return jsonify({"ok": False, "error": err}), 404

    if df.empty:
        return jsonify({"ok": True, "scenario": scenario, "rows": []})

    return jsonify({"ok": True, "scenario": scenario, "rows": df.to_dict(orient="records")})


@results_bp.get("/<scenario>/delivery-excel")
def delivery_excel(scenario):
    df, err = load_delivery_for_scenario(scenario)
    if err:
        return jsonify({"ok": False, "error": err}), 404

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        workbook = writer.book
        header_fmt = workbook.add_format(
            {"bold": True, "bg_color": "#DCE6F1", "border": 1}
        )

        df.to_excel(writer, sheet_name="Delivery Report", index=False)
        ws = writer.sheets["Delivery Report"]

        for i, col in enumerate(df.columns):
            ws.write(0, i, col, header_fmt)
            ws.set_column(i, i, 22)

        ws.autofilter(0, 0, len(df), len(df.columns) - 1)

    output.seek(0)
    return send_file(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=f"{scenario}_delivery.xlsx"
    )
