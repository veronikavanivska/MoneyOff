export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export type Issue = { field: string; message: string };

export type Currency = "PLN" | "EUR" | "USD";
export const CURRENCIES: ReadonlyArray<Currency> = ["PLN", "EUR", "USD"];

export type FxPLN = Readonly<Record<Currency, number>>;

/**
 * @param value Wartość wejściowa.
 * @returns True jeśli `value` jest wspieraną walutą.
 * @remarks Czysta funkcja; type guard; brak efektów ubocznych.
 */
export const isCurrency = (value: string): value is Currency =>
    CURRENCIES.includes(value as Currency);

/**
 * @param amount Kwota w walucie `from`.
 * @param from Waluta źródłowa.
 * @param to Waluta docelowa.
 * @param fxPLN Kursy w postaci PLN za 1 jednostkę waluty.
 * @returns Kwota przeliczona do waluty docelowej.
 * @remarks Czysta funkcja; deterministyczna; konwersja dwustopniowa (from->PLN->to).
 */

export const convertAmount = (
    amount: number,
    from: Currency,
    to: Currency,
    fxPLN: FxPLN
): number => {
    const fromRate = fxPLN[from] ?? 1;
    const toRate = fxPLN[to] ?? 1;
    return (amount * fromRate) / toRate;
};

export type Expense = {
    readonly id: string;
    readonly amount: number;
    readonly currency: Currency;
    readonly category: string;
    readonly dateISO: string;
    readonly note: string;
};

export type ExpenseDraft = Omit<Expense, "id">;

export type Filters = {
    readonly dateFrom: string | null;
    readonly dateTo: string | null;
    readonly category: string | null;
    readonly text: string;
};

export type SortBy = "date" | "amount";

export type State = {
    readonly expenses: ReadonlyArray<Expense>;
    readonly categories: ReadonlyArray<string>;
    /** Waluta bazowa UI/podsumowań. */
    readonly currency: Currency;
    readonly filters: Filters;
    readonly sort: SortBy;
    /** Kursy PLN za 1 walutę (PLN/EUR/USD). */
    readonly fxPLN: FxPLN;
    /** Etykieta źródła kursów (np. "NBP 2026-01-02", "fallback"). */
    readonly fxLabel: string;
};

export type Summary = {
    readonly total: number;
    readonly byCategory: ReadonlyArray<{ category: string; total: number }>;
    readonly monthly: ReadonlyArray<{ month: string; total: number }>;
};

export type Action =
    | { kind: "add"; expense: Expense }
    | { kind: "edit"; id: string; patch: Partial<ExpenseDraft> }
    | { kind: "delete"; id: string }
    | { kind: "setFilters"; filters: Partial<Filters> }
    | { kind: "setSort"; sort: SortBy }
    | { kind: "addCategory"; category: string }
    | { kind: "setCurrency"; currency: Currency }
    | { kind: "setFx"; fxPLN: FxPLN; label: string }
    | { kind: "replaceState"; state: State }
    | { kind: "mergeState"; state: State };

/**
 * @returns Domyślny stan początkowy.
 * @remarks Czysta funkcja; data-first design; brak IO; niemutowalna struktura danych.
 */
export const createInitialState = (): State => ({
    expenses: [],
    categories: ["Jedzenie", "Transport", "Rachunki", "Rozrywka", "Inne"],
    currency: "PLN",
    filters: { dateFrom: null, dateTo: null, category: null, text: "" },
    sort: "date",
    fxPLN: { PLN: 1, EUR: 1, USD: 1 },
    fxLabel: "brak (1.0)",
});

/**
 * @returns Nowy UUID v4.
 * @remarks Funkcja nieczysta (losowość); granica IO/entropy; izolowana do wywołań w powłoce.
 */
export const uuid = (): string => crypto.randomUUID();

/**
 * @param input Surowe dane formularza jako mapa klucz-wartość.
 * @returns Result z draftem wydatku lub komunikatem błędu.
 * @remarks Czysta funkcja; defensywne parsowanie; discriminated unions; brak DOM i IO.
 */
export const parseExpenseForm = (
    input: Record<string, string>
): Result<ExpenseDraft> => {
    const amountRaw = (input["amount"] ?? "").trim();
    const amount = Number.parseFloat(amountRaw);
    if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
        return { ok: false, error: "Kwota musi być liczbą dodatnią" };
    }

    const currencyRaw = String(input["currency"] ?? "").trim().toUpperCase();
    if (!currencyRaw) return { ok: false, error: "Waluta jest wymagana" };
    if (!isCurrency(currencyRaw)) return { ok: false, error: "Nieprawidłowa waluta" };
    const currency = currencyRaw as Currency;

    const category = (input["category"] ?? "").trim();
    if (!category) return { ok: false, error: "Kategoria jest wymagana" };

    const dateISO = (input["date"] ?? "").trim();
    if (!dateISO) return { ok: false, error: "Data jest wymagana" };

    const note = (input["note"] ?? "").trim();

    return { ok: true, value: { amount, currency, category, dateISO, note } };
};

/**
 * @param draft Draft wydatku do walidacji.
 * @returns Lista problemów walidacyjnych; pusta jeśli poprawny.
 * @remarks Czysta funkcja; walidacja domenowa; brak efektów ubocznych.
 */
export const validateExpense = (draft: ExpenseDraft): ReadonlyArray<Issue> => {
    const issues: Issue[] = [];
    if (draft.amount <= 0) issues.push({ field: "amount", message: "Kwota musi być większa od 0" });
    if (!isCurrency(draft.currency)) issues.push({ field: "currency", message: "Nieprawidłowa waluta" });
    if (!draft.category.trim()) issues.push({ field: "category", message: "Kategoria jest wymagana" });
    if (!draft.dateISO || Number.isNaN(Date.parse(draft.dateISO))) issues.push({ field: "date", message: "Wymagana poprawna data" });
    return issues;
};

/**
 * @param filters Aktualne filtry.
 * @param patch Częściowe zmiany filtrów.
 * @returns Nowe filtry po zastosowaniu patcha, z korektą zakresu dat.
 * @remarks Czysta funkcja; niemutowalność; walidacja spójności (dateFrom <= dateTo).
 */
export const validateFilters = (filters: Filters, patch: Partial<Filters>): Filters => {
    const next: Filters = { ...filters, ...patch };

    if (next.dateFrom && next.dateTo) {
        const fromTime = Date.parse(next.dateFrom);
        const toTime = Date.parse(next.dateTo);
        if (fromTime > toTime) {
            if ("dateFrom" in patch) return { ...next, dateTo: next.dateFrom };
            if ("dateTo" in patch) return { ...next, dateFrom: next.dateTo };
        }
    }

    return next;
};

type ActionKind = Action["kind"];
type ActionOf<K extends ActionKind> = Extract<Action, { kind: K }>;
type CaseReducer<K extends ActionKind> = (state: State, action: ActionOf<K>) => State;


const reducers: { [K in ActionKind]: CaseReducer<K> } = {
    add: (state, action) => {
        const categories = state.categories.includes(action.expense.category)
            ? state.categories
            : [...state.categories, action.expense.category];

        return {
            ...state,
            categories,
            expenses: [action.expense, ...state.expenses],
        };
    },

    edit: (state, action) => ({
        ...state,
        expenses: state.expenses.map((e) =>
            e.id === action.id ? { ...e, ...action.patch } : e
        ),
    }),

    delete: (state, action) => ({
        ...state,
        expenses: state.expenses.filter((e) => e.id !== action.id),
    }),

    setFilters: (state, action) => ({
        ...state,
        filters: validateFilters(state.filters, action.filters),
    }),

    setSort: (state, action) => ({ ...state, sort: action.sort }),

    addCategory: (state, action) => {
        const name = action.category.trim();
        if (!name || state.categories.includes(name)) return state;
        return { ...state, categories: [...state.categories, name] };
    },

    setCurrency: (state, action) => ({ ...state, currency: action.currency }),

    setFx: (state, action) => ({
        ...state,
        fxPLN: {
            PLN: 1,
            EUR: action.fxPLN.EUR > 0 ? action.fxPLN.EUR : state.fxPLN.EUR,
            USD: action.fxPLN.USD > 0 ? action.fxPLN.USD : state.fxPLN.USD,
        },
        fxLabel: action.label,
    }),

    replaceState: (_state, action) => ({ ...action.state }),

    mergeState: (state, action) => {
        const mergedCategories = Array.from(
            new Set([...state.categories, ...action.state.categories])
        );

        const existingIds = new Set(state.expenses.map((e) => e.id));
        const newExpenses = action.state.expenses.filter((e) => !existingIds.has(e.id));

        // Kursy i waluta bazowa zostają lokalne (nie nadpisujemy importem)
        return {
            ...state,
            categories: mergedCategories,
            expenses: [...state.expenses, ...newExpenses],
        };
    },
};

/**
 * @param state Aktualny stan aplikacji.
 * @param action Akcja do zastosowania.
 * @returns Nowy stan po zastosowaniu akcji.
 * @remarks Czysta funkcja; reducer jako mapa przypadków; brak mutacji; data-first design.
 */
export const reduce = (state: State, action: Action): State => {
    return (reducers as any)[action.kind](state, action);
};

/**
 * @param state Aktualny stan.
 * @param filters Filtry do zastosowania.
 * @returns Lista wydatków po filtracji i sortowaniu.
 * @remarks Czysta funkcja; kompozycja predykatów; brak efektów ubocznych.
 */
export const selectVisibleExpenses = (
    state: State,
    filters: Filters
): ReadonlyArray<Expense> => {
    const matchDate = (e: Expense): boolean => {
        const t = Date.parse(e.dateISO);
        if (filters.dateFrom && t < Date.parse(filters.dateFrom)) return false;
        if (filters.dateTo && t > Date.parse(filters.dateTo)) return false;
        return true;
    };

    const matchCategory = (e: Expense): boolean =>
        !filters.category || e.category === filters.category;

    const matchText = (e: Expense): boolean =>
        !filters.text ||
        e.note.toLowerCase().includes(filters.text.toLowerCase().trim());

    const filtered = state.expenses.filter(
        (e) => matchDate(e) && matchCategory(e) && matchText(e)
    );

    const sorted = [...filtered].sort((a, b) =>
        state.sort === "amount"
            ? b.amount - a.amount
            : Date.parse(b.dateISO) - Date.parse(a.dateISO)
    );

    return sorted;
};


const addTo = (rec: Record<string, number>, key: string, delta: number) => ({
    ...rec,
    [key]: (rec[key] ?? 0) + delta,
});

/**
 * @param expenses Lista wydatków.
 * @param targetCurrency Waluta bazowa podsumowań.
 * @param fxPLN Kursy w postaci PLN za 1 jednostkę waluty.
 * @returns Podsumowanie (total, byCategory, monthly) w walucie bazowej.
 * @remarks Czysta funkcja; deterministyczna; agregacje niemutowalne; używa konwersji walut.
 */
export const computeSummary = (
    expenses: ReadonlyArray<Expense>,
    targetCurrency: Currency,
    fxPLN: FxPLN
): Summary => {
    const asTarget = (e: Expense) =>
        convertAmount(e.amount, e.currency, targetCurrency, fxPLN);

    const total = expenses.reduce((sum, e) => sum + asTarget(e), 0);

    const catMap = expenses.reduce<Record<string, number>>(
        (acc, e) => addTo(acc, e.category, asTarget(e)),
        {}
    );

    const byCategory = Object.entries(catMap)
        .map(([category, t]) => ({ category, total: t }))
        .sort((a, b) => b.total - a.total);

    const monthMap = expenses.reduce<Record<string, number>>((acc, e) => {
        const month = e.dateISO.slice(0, 7);
        return addTo(acc, month, asTarget(e));
    }, {});

    const monthly = Object.entries(monthMap)
        .map(([month, t]) => ({ month, total: t }))
        .sort((a, b) => (b.month > a.month ? 1 : -1));

    return { total, byCategory, monthly };
};

/**
 * @param state Stan do serializacji.
 * @returns JSON jako string.
 * @remarks Czysta funkcja; brak IO; stabilny kontrakt zapisu.
 */
export const serialize = (state: State): string => JSON.stringify(state);

const pickFx = (obj: any): FxPLN => {
    const eur = Number(obj?.fxPLN?.EUR);
    const usd = Number(obj?.fxPLN?.USD);
    return {
        PLN: 1,
        EUR: Number.isFinite(eur) && eur > 0 ? eur : 1,
        USD: Number.isFinite(usd) && usd > 0 ? usd : 1,
    };
};

/**
 * @param text Tekst JSON do sparsowania.
 * @returns Result ze stanem lub komunikatem błędu.
 * @remarks Czysta funkcja; defensywne parsowanie; sanitizacja danych wejściowych.
 */
export const deserialize = (text: string): Result<State> => {
    try {
        const obj = JSON.parse(text);
        if (!obj || typeof obj !== "object")
            return { ok: false, error: "Nieprawidłowa struktura JSON" };

        if (!Array.isArray(obj.expenses) || !Array.isArray(obj.categories))
            return { ok: false, error: "Brak tablicy wydatków lub kategorii" };

        const expenses: Expense[] = obj.expenses
            .map((e: unknown) => {
                if (!e || typeof e !== "object") return null;
                const rec = e as Record<string, unknown>;
                const currencyRaw = String(rec["currency"] ?? "PLN").toUpperCase();

                return {
                    id: String(rec["id"] ?? ""),
                    amount: Number(rec["amount"] ?? 0),
                    currency: isCurrency(currencyRaw) ? (currencyRaw as Currency) : "PLN",
                    category: String(rec["category"] ?? ""),
                    dateISO: String(rec["dateISO"] ?? ""),
                    note: String(rec["note"] ?? ""),
                };
            })
            .filter(
                (e: Expense | null): e is Expense =>
                    e !== null &&
                    e.id !== "" &&
                    e.category !== "" &&
                    e.dateISO !== "" &&
                    e.amount > 0
            );

        const currencyRaw = String(obj.currency ?? "PLN").toUpperCase();
        const filtersObj = obj.filters ?? {};

        const state: State = {
            expenses,
            categories: obj.categories
                .map((c: unknown) => String(c))
                .filter((s: string) => s.trim().length > 0),
            currency: isCurrency(currencyRaw) ? (currencyRaw as Currency) : "PLN",
            filters: {
                dateFrom: filtersObj.dateFrom ?? null,
                dateTo: filtersObj.dateTo ?? null,
                category: filtersObj.category ?? null,
                text: String(filtersObj.text ?? ""),
            },
            sort: obj.sort === "amount" ? "amount" : "date",
            fxPLN: pickFx(obj),
            fxLabel: typeof obj.fxLabel === "string" ? obj.fxLabel : "brak (1.0)",
        };

        return { ok: true, value: state };
    } catch {
        return { ok: false, error: "Nie udało się sparsować pliku JSON" };
    }
};
