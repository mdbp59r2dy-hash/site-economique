#!/usr/bin/env python3
"""Suppression definitive d'informations jugees inutiles.

Usage : python scripts/delete_items.py "id1,id2,id3"

- Ajoute les IDs a data/deleted.json (ils ne reapparaitront jamais).
- Les retire immediatement de data/latest.json et de toutes les archives.
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
ARCHIVE_DIR = os.path.join(DATA_DIR, "archive")
LATEST_PATH = os.path.join(DATA_DIR, "latest.json")
DELETED_PATH = os.path.join(DATA_DIR, "deleted.json")


def load_json(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")


def scrub_file(path, ids):
    data = load_json(path, None)
    if not data or "days" not in data:
        return 0
    removed = 0
    for day in data["days"]:
        for category, items in list(day.get("news", {}).items()):
            before = len(items)
            day["news"][category] = [it for it in items if it["id"] not in ids]
            removed += before - len(day["news"][category])
    if removed:
        save_json(path, data)
    return removed


def main():
    raw = " ".join(sys.argv[1:])
    ids = {t for t in re.split(r"[\s,;]+", raw) if re.fullmatch(r"[0-9a-f]{12}", t)}
    if not ids:
        print("Aucun ID valide fourni (12 caracteres hexadecimaux attendus).")
        sys.exit(1)

    deleted = load_json(DELETED_PATH, {"ids": []})
    deleted["ids"] = sorted(set(deleted.get("ids", [])) | ids)
    save_json(DELETED_PATH, deleted)

    removed = scrub_file(LATEST_PATH, ids)
    if os.path.isdir(ARCHIVE_DIR):
        for name in os.listdir(ARCHIVE_DIR):
            if re.fullmatch(r"\d{4}-\d{2}\.json", name):
                removed += scrub_file(os.path.join(ARCHIVE_DIR, name), ids)

    print(f"{len(ids)} ID(s) ajoutes a la liste noire, {removed} element(s) retire(s) des fichiers.")


if __name__ == "__main__":
    main()
