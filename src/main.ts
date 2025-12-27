/**
 * @file Imperatywna powłoka:  podpinanie, IO storage, IO plików.
 * @remarks Wszystkie efekty uboczne są izolowane tutaj.  Dispatche akcji do czystego reducera.
 */

import {
    Action,
    createInitialState,
    Currency,
    deserialize,
    ExpenseDraft,
    isCurrency,
    parseExpenseForm,
    reduce,
    Result,
    selectVisibleExpenses,
    serialize,
    State,
    uuid,
    validateExpense
} from "./core";
import { renderApp, updateList, updateCategories, updateFilterDates } from "./ui";

const STORAGE_KEY = "expense-tracker-state";

/**
 * @param key Klucz storage.
 * @returns Załadowany stan lub domyślny.
 * @remarks Granica IO; nieczysty odczyt storage.
 */
const loadState = (key: string): State => {
    const raw = localStorage.getItem(key);
    if (!raw) return createInitialState();
    const result = deserialize(raw);
    return result. ok ? result.value : createInitialState();
};

/**
 * @param key Klucz storage.
 * @param state Stan do zapisania.
 * @remarks Granica IO; nieczysty zapis storage.
 */
const saveState = (key: string, state: State): void => {
    localStorage.setItem(key, serialize(state));
};

/**
 * @param draft Draft wydatku.
 * @returns Pełny wydatek z wygenerowanym id.
 * @remarks Nieczysta przez uuid; izolowana losowość.
 */
const realizeExpense = (draft: ExpenseDraft) => ({ ... draft, id: uuid() });

let state:  State = loadState(STORAGE_KEY);
let isInitialRender = true;

const root = document.getElementById("app");
if (!root) throw new Error("Nie znaleziono kontenera aplikacji");

type UpdateKind = "full" | "list" | "categories" | "filterDates";

/**
 * @param action Akcja do dispatcha.
 * @param updateKind Rodzaj aktualizacji UI.
 * @remarks Granica IO; wywołuje czysty reducer potem zapisuje.
 */
const dispatch = (action: Action, updateKind: UpdateKind = "list"): void => {
    state = reduce(state, action);
    saveState(STORAGE_KEY, state);
    render(updateKind);
};

/**
 * @param updateKind Rodzaj aktualizacji UI.
 * @remarks Granica IO; renderuje UI z aktualnego stanu.
 */
const render = (updateKind: UpdateKind = "full"): void => {
    const visible = selectVisibleExpenses(state, state.filters);

    if (isInitialRender || updateKind === "full") {
        renderApp(root, state, visible, {
            onAdd: handleAdd,
            onQuickCategory: handleQuickCategory,
            onFilter: handleFilter,
            onSort: handleSort,
            onDelete: handleDelete,
            onEdit: handleEdit,
            onExport: handleExport,
            onImport: handleImport
        });
        isInitialRender = false;
    } else if (updateKind === "list") {
        updateList(root, state, visible);
    } else if (updateKind === "categories") {
        updateCategories(root, state);
        updateList(root, state, visible);
    } else if (updateKind === "filterDates") {
        updateFilterDates(root, state);
        updateList(root, state, visible);
    }
};

/**
 * @param data Dane formularza z formularza dodawania.
 * @remarks Granica IO; parsuje formularz i dispatchuje akcję add.
 */
const handleAdd = (data: FormData): void => {
    const raw:  Record<string, string> = {};
    data.forEach((v, k) => {
        raw[k] = String(v);
    });
    const parsed = parseExpenseForm(raw);
    if (! parsed.ok) {
        alert(parsed.error);
        return;
    }
    const issues = validateExpense(parsed.value);
    if (issues.length > 0) {
        alert(issues.map((i) => `${i.field}: ${i. message}`).join("\n"));
        return;
    }
    dispatch({ kind: "add", expense: realizeExpense(parsed.value) }, "categories");
};

/**
 * @param name Nazwa kategorii.
 * @remarks Granica IO; dodaje kategorię.
 */
const handleQuickCategory = (name: string): void => {
    if (! name) return;
    dispatch({ kind: "addCategory", category: name }, "categories");
};

/**
 * @param patch Częściowe filtry.
 * @remarks Granica IO; aktualizuje filtry bez pełnego rerendera.
 */
const handleFilter = (patch:  Partial<typeof state.filters>): void => {
    const hasDateChange = "dateFrom" in patch || "dateTo" in patch;
    dispatch(
        { kind: "setFilters", filters: patch },
        hasDateChange ? "filterDates" : "list"
    );
};

/**
 * @param sort Sortowanie.
 * @remarks Granica IO; aktualizuje sortowanie.
 */
const handleSort = (sort: "date" | "amount"): void => {
    dispatch({ kind:  "setSort", sort }, "list");
};

/**
 * @param id ID wydatku do usunięcia.
 * @remarks Granica IO; usuwa wydatek.
 */
const handleDelete = (id: string): void => {
    if (confirm("Czy na pewno chcesz usunąć ten wydatek?")) {
        dispatch({ kind: "delete", id }, "list");
    }
};

/**
 * @param id ID wydatku do edycji.
 * @remarks Granica IO; używa prompt dla prostoty.
 */
const handleEdit = (id: string): void => {
    const exp = state.expenses.find((e) => e.id === id);
    if (!exp) return;
    const amount = prompt("Kwota", String(exp.amount));
    const category = prompt("Kategoria", exp.category);
    const dateISO = prompt("Data (RRRR-MM-DD)", exp.dateISO);
    const currencyInput = prompt("Waluta (PLN/EUR/USD)", exp.currency);
    const note = prompt("Notatka", exp.note);
    if (amount === null || category === null || dateISO === null || currencyInput === null || note === null) return;

    const currency:  Currency = isCurrency(currencyInput. toUpperCase())
        ? (currencyInput.toUpperCase() as Currency)
        : exp.currency;

    const draft: ExpenseDraft = {
        amount: Number. parseFloat(amount) || exp.amount,
        currency,
        category:  category || exp.category,
        dateISO: dateISO || exp. dateISO,
        note:  note
    };
    const issues = validateExpense(draft);
    if (issues.length > 0) {
        alert(issues.map((i) => `${i.field}: ${i.message}`).join("\n"));
        return;
    }
    dispatch({ kind: "edit", id, patch: draft }, "categories");
};

/**
 * @remarks Granica IO; eksportuje stan jako plik JSON do pobrania.
 */
const handleExport = (): void => {
    const blob = new Blob([serialize(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wydatki. json";
    a.click();
    URL.revokeObjectURL(url);
};

/**
 * @param file Plik JSON do importu.
 * @remarks Granica IO; czyta plik i dispatchuje merge lub replace.
 */
const handleImport = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => {
        const text = String(reader.result ??  "");
        const result:  Result<State> = deserialize(text);
        if (!result.ok) {
            alert(result.error);
            return;
        }
        const replace = confirm(
            "Zastąpić wszystkie dane?  Anuluj aby scalić z istniejącymi."
        );
        if (replace) {
            dispatch({ kind: "replaceState", state: result.value }, "full");
        } else {
            dispatch({ kind: "mergeState", state: result.value }, "full");
        }
    };
    reader.readAsText(file);
};

render("full");