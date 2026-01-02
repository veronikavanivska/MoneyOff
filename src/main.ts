import {
    Action,
    Currency,
    FxPLN,
    ExpenseDraft,
    Result,
    deserialize,
    parseExpenseForm,
    reduce,
    selectVisibleExpenses,
    serialize,
    State,
    uuid,
    validateExpense,
} from "./core";

import { getState, persistState } from "./state/storage";
import { mountApp, updateCategories, updateFilterDates, updateList, ImportMode } from "./ui/dom";

const STORAGE_KEY = "expense-tracker-state";
type UpdateKind = "full" | "list" | "categories" | "filterDates";

/**
 * @returns Result<void> w stanie Ok.
 * @remarks Czysta funkcja; helper do budowania wyników bez efektów ubocznych.
 */
const ok = (): Result<void> => ({ ok: true, value: undefined });

/**
 * @returns Result<void> w stanie Ok.
 * @remarks Czysta funkcja; helper do budowania wyników bez efektów ubocznych.
 */
const err = (m: string): Result<void> => ({ ok: false, error: m });

const FALLBACK_FX: FxPLN = { PLN: 1, EUR: 4.30, USD: 3.95 };
const FALLBACK_LABEL = "fallback";

const realizeExpense = (draft: ExpenseDraft) => ({ ...draft, id: uuid() });

let state: State = getState(localStorage, STORAGE_KEY);
let isInitialRender = true;

const root = document.getElementById("app");
if (!root) throw new Error("Nie znaleziono kontenera aplikacji");

/**
 * @param updateKind Rodzaj aktualizacji UI.
 * @remarks Granica IO; odczytuje bieżący stan, oblicza widok selektorem i deleguje render do warstwy UI.
 * Mapuje updateKind na funkcje (dispatch table), eliminując imperatywne if/else.
 */
const render = (updateKind: UpdateKind = "full"): void => {
    const visible = selectVisibleExpenses(state, state.filters);

    const handlersMap: Record<UpdateKind, () => void> = {
        full: () => {
            mountApp(root, state, visible, {
                onAdd: handleAdd,
                onQuickCategory: handleQuickCategory,
                onFilter: handleFilter,
                onSort: handleSort,
                onDelete: handleDelete,
                onEdit: handleEdit,
                onExport: handleExport,

                onImportParse: handleImportParse,
                onImportApply: handleImportApply,

                onBaseCurrency: handleBaseCurrency,
                onRefreshFx: handleRefreshFx,

                getExpense: (id: string) => state.expenses.find((e) => e.id === id) ?? null,
            });
            isInitialRender = false;
        },
        list: () => updateList(root, state, visible),
        categories: () => {
            updateCategories(root, state);
            updateList(root, state, visible);
        },
        filterDates: () => {
            updateFilterDates(root, state);
            updateList(root, state, visible);
        },
    };

    if (isInitialRender) handlersMap.full();
    else (handlersMap[updateKind] ?? handlersMap.full)();
};

/**
 * @param action Akcja domenowa.
 * @param updateKind Rodzaj aktualizacji UI po dispatchu.
 * @remarks Granica IO; uruchamia czysty reducer, persystuje stan do storage i inicjuje render.
 * Nie mutuje struktur stanu domenowego — jedynie podmienia referencję state na nową.
 */
const dispatch = (action: Action, updateKind: UpdateKind = "list"): void => {
    state = reduce(state, action);
    persistState(localStorage, STORAGE_KEY, state);
    render(updateKind);
};

type NbpRate = { currency: string; code: string; mid: number };
type NbpTableA = { table: string; no: string; effectiveDate: string; rates: NbpRate[] };

/**
 * @returns Result z kursami FxPLN oraz etykietą źródła (np. "NBP YYYY-MM-DD"), albo Err z opisem.
 * @remarks Granica IO (fetch); jedyne miejsce kontaktu z zewnętrznym API kursów.
 * Funkcja nie modyfikuje stanu — zwraca dane do zastosowania przez dispatch.
 */
const fetchFxFromNbp = async (): Promise<Result<{ fxPLN: FxPLN; label: string }>> => {
    try {
        const resp = await fetch("https://api.nbp.pl/api/exchangerates/tables/A/?format=json", {
            headers: { Accept: "application/json" },
        });
        if (!resp.ok) return { ok: false, error: `NBP HTTP ${resp.status}` };

        const data = (await resp.json()) as NbpTableA[];
        const table = data?.[0];
        if (!table || !Array.isArray(table.rates)) {
            return { ok: false, error: "Nieprawidłowy format odpowiedzi NBP" };
        }

        const getMid = (code: Currency): number | null => {
            if (code === "PLN") return 1;
            const r = table.rates.find((x) => x.code === code);
            return typeof r?.mid === "number" && r.mid > 0 ? r.mid : null;
        };

        const eur = getMid("EUR");
        const usd = getMid("USD");
        if (eur === null || usd === null) return { ok: false, error: "Brak kursu EUR lub USD w tabeli NBP" };

        return {
            ok: true,
            value: { fxPLN: { PLN: 1, EUR: eur, USD: usd }, label: `NBP ${table.effectiveDate}` },
        };
    } catch {
        return { ok: false, error: "Nie udało się pobrać kursów (błąd sieci/CORS)" };
    }
};

/**
 * @remarks Granica IO (pośrednio przez dispatch); zapewnia działającą konwersję walut od startu aplikacji.
 * Ustawia fallback kursów tylko wtedy, gdy w stanie brak wiarygodnych kursów (np. 1.0).
 */
const ensureFx = (): void => {
    if (!state.fxLabel || state.fxLabel === "brak (1.0)") {
        dispatch({ kind: "setFx", fxPLN: FALLBACK_FX, label: FALLBACK_LABEL }, "full");
    }
};

/**
 * @returns Promise<void>
 * @remarks Granica IO; inicjalizacja kursów:
 * 1) ustawia fallback dla natychmiastowej poprawności podsumowań,
 * 2) próbuje nadpisać kursy danymi z NBP, jeśli fetch się powiedzie.
 */
const initFx = async (): Promise<void> => {
    ensureFx();
    const got = await fetchFxFromNbp();
    if (got.ok) dispatch({ kind: "setFx", fxPLN: got.value.fxPLN, label: got.value.label }, "full");
};

/**
 * @returns Promise<Result<void>> informujący o powodzeniu/niepowodzeniu pobrania kursów.
 * @remarks Granica IO; ręczne odświeżenie kursów z NBP na żądanie użytkownika.
 * Aktualizacja stanu odbywa się wyłącznie przez dispatch.
 */
const handleRefreshFx = async (): Promise<Result<void>> => {
    const got = await fetchFxFromNbp();
    if (!got.ok) return { ok: false, error: got.error };
    dispatch({ kind: "setFx", fxPLN: got.value.fxPLN, label: got.value.label }, "full");
    return ok();
};

/**
 * @param data Dane formularza dodawania (FormData).
 * @returns Result<void> — Ok przy dodaniu, Err przy błędach parsowania/walidacji.
 * @remarks Granica IO (FormData); mapuje dane wejściowe na model domenowy przez czyste parse/validate.
 * Brak alert/prompt — błędy zwracane jako Result do centralnej obsługi UI.
 */
const handleAdd = (data: FormData): Result<void> => {
    const raw: Record<string, string> = {};
    data.forEach((v, k) => (raw[k] = String(v)));

    const parsed = parseExpenseForm(raw);
    if (!parsed.ok) return err(parsed.error);

    const issues = validateExpense(parsed.value);
    if (issues.length > 0) {
        return err(issues.map((i) => `${i.field}: ${i.message}`).join("\n"));
    }

    dispatch({ kind: "add", expense: realizeExpense(parsed.value) }, "categories");
    return ok();
};

/**
 * @param name Nazwa kategorii.
 * @returns Result<void> — Ok przy dodaniu, Err jeśli wejście puste.
 * @remarks Granica IO; waliduje minimalnie input i dispatchuje akcję domenową.
 */
const handleQuickCategory = (name: string): Result<void> => {
    const trimmed = name.trim();
    if (!trimmed) return err("Nazwa kategorii nie może być pusta.");
    dispatch({ kind: "addCategory", category: trimmed }, "categories");
    return ok();
};

/**
 * @param patch Częściowa aktualizacja filtrów.
 * @remarks Granica IO; dispatchuje zmianę filtrów i dobiera typ aktualizacji UI (np. aktualizacja dat).
 */
const handleFilter = (patch: Partial<typeof state.filters>): void => {
    const hasDateChange = "dateFrom" in patch || "dateTo" in patch;
    dispatch({ kind: "setFilters", filters: patch }, hasDateChange ? "filterDates" : "list");
};

/**
 * @param sort Kryterium sortowania.
 * @remarks Granica IO; aktualizuje sortowanie poprzez dispatch.
 */
const handleSort = (sort: "date" | "amount"): void => {
    dispatch({ kind: "setSort", sort }, "list");
};

/**
 * @param id Identyfikator wydatku.
 * @returns Result<void> — Ok przy usunięciu, Err jeśli wydatek nie istnieje.
 * @remarks Granica IO; logika potwierdzenia jest w UI (dialog), tutaj tylko walidacja istnienia i dispatch.
 */
const handleDelete = (id: string): Result<void> => {
    const exists = state.expenses.some((e) => e.id === id);
    if (!exists) return err("Nie znaleziono wydatku do usunięcia.");
    dispatch({ kind: "delete", id }, "list");
    return ok();
};

/**
 * @param id Identyfikator edytowanego wydatku.
 * @param data Dane formularza edycji (FormData).
 * @returns Result<void> — Ok przy zapisie, Err przy braku rekordu lub błędach walidacji.
 * @remarks Granica IO; edycja realizowana bez prompt (dialog DOM w UI).
 * Dane wejściowe przechodzą przez czyste parse/validate; aktualizacja wyłącznie przez dispatch.
 */
const handleEdit = (id: string, data: FormData): Result<void> => {
    const exists = state.expenses.some((e) => e.id === id);
    if (!exists) return err("Nie znaleziono wydatku do edycji.");

    const raw: Record<string, string> = {};
    data.forEach((v, k) => (raw[k] = String(v)));

    const parsed = parseExpenseForm(raw);
    if (!parsed.ok) return err(parsed.error);

    const issues = validateExpense(parsed.value);
    if (issues.length > 0) {
        return err(issues.map((i) => `${i.field}: ${i.message}`).join("\n"));
    }

    dispatch({ kind: "edit", id, patch: parsed.value }, "categories");
    return ok();
};

/**
 * @param currency Nowa waluta bazowa podsumowań.
 * @remarks Granica IO; aktualizuje walutę bazową w stanie (wpływa na computeSummary i render).
 */

const handleBaseCurrency = (currency: Currency): void => {
    dispatch({ kind: "setCurrency", currency }, "full");
};

/**
 * @remarks Granica IO; eksportuje stan do pliku JSON (Blob + URL.createObjectURL).
 * Brak logiki domenowej — wyłącznie serializacja i mechanika pobierania pliku.
 */
const handleExport = (): void => {
    const blob = new Blob([serialize(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "wydatki.json";
    a.click();

    URL.revokeObjectURL(url);
};

/**
 * @param file Plik do odczytu.
 * @returns Promise<Result<string>> z treścią pliku lub Err przy błędzie odczytu.
 * @remarks Granica IO; izoluje FileReader i ujednolica błędy do Result.
 */
const readFileAsText = (file: File): Promise<Result<string>> =>
    new Promise((resolve) => {
        const reader = new FileReader();
        reader.onerror = () => resolve({ ok: false, error: "Nie udało się odczytać pliku" });
        reader.onload = () => resolve({ ok: true, value: String(reader.result ?? "") });
        reader.readAsText(file);
    });

/**
 * @param file Plik importu (JSON).
 * @returns Promise<Result<State>> — sparsowany stan lub Err przy błędach odczytu/parsowania.
 * @remarks Granica IO; odczyt pliku + delegacja parsowania do czystego deserialize z core.ts.
 * Nie modyfikuje stanu — tylko przygotowuje dane do zastosowania.
 */
const handleImportParse = async (file: File): Promise<Result<State>> => {
    const textR = await readFileAsText(file);
    if (!textR.ok) return { ok: false, error: textR.error };

    const parsed = deserialize(textR.value);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    return { ok: true, value: parsed.value };
};

/**
 * @param mode Tryb importu: replace lub merge.
 * @param incoming Stan z importu.
 * @returns Result<void> — Ok po zastosowaniu, Err w przypadku błędu (jeśli dodasz walidacje).
 * @remarks Granica IO (pośrednio przez dispatch); stosuje import przez akcje domenowe replace/merge.
 * Decyzja użytkownika (replace/merge) jest obsłużona w UI (dialog).
 */
const handleImportApply = (mode: ImportMode, incoming: State): Result<void> => {
    if (mode === "replace") dispatch({ kind: "replaceState", state: incoming }, "full");
    else dispatch({ kind: "mergeState", state: incoming }, "full");
    return ok();
};

/**
 * @remarks Punkt wejścia aplikacji: pierwszy render + asynchroniczna inicjalizacja kursów.
 */
render("full");
void initFx();
