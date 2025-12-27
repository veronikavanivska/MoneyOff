/**
 * @file Czyste funkcyjne jądro:  typy, reducer, selektory, walidacja, serializacja.
 * @remarks Brak DOM, brak storage, brak efektów ubocznych.  Tylko niemutowalne transformacje.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; error:  string };

export type Issue = { field: string; message: string };

export type Currency = "PLN" | "EUR" | "USD";

export const CURRENCIES: ReadonlyArray<Currency> = ["PLN", "EUR", "USD"];

export type Expense = {
    readonly id: string;
    readonly amount: number;
    readonly currency: Currency;
    readonly category:  string;
    readonly dateISO: string;
    readonly note:  string;
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
    readonly currency: Currency;
    readonly filters:  Filters;
    readonly sort:  SortBy;
};

export type Summary = {
    readonly total: number;
    readonly byCategory: ReadonlyArray<{ category: string; total: number }>;
    readonly monthly: ReadonlyArray<{ month: string; total: number }>;
};

export type Action =
    | { kind: "add"; expense:  Expense }
    | { kind:  "edit"; id: string; patch:  Partial<ExpenseDraft> }
    | { kind: "delete"; id:  string }
    | { kind:  "setFilters"; filters: Partial<Filters> }
    | { kind: "setSort"; sort:  SortBy }
    | { kind: "addCategory"; category: string }
    | { kind: "setCurrency"; currency: Currency }
    | { kind: "replaceState"; state: State }
    | { kind: "mergeState"; state: State };

/**
 * @returns Domyślny stan początkowy.
 * @remarks Czysta funkcja; data-first design.
 */
export const createInitialState = (): State => ({
    expenses: [],
    categories: ["Jedzenie", "Transport", "Rachunki", "Rozrywka", "Inne"],
    currency:  "PLN",
    filters:  { dateFrom: null, dateTo:  null, category: null, text:  "" },
    sort: "date"
});

/**
 * @returns Dzisiejsza data w formacie ISO.
 * @remarks Czysta funkcja; helper kompozycyjny.
 */
export const todayISO = (): string => new Date().toISOString().slice(0, 10);

/**
 * @returns Nowy UUID v4.
 * @remarks Używa crypto API; izolowana losowość.
 */
export const uuid = (): string => crypto.randomUUID();

/**
 * @param value Wartość do sprawdzenia.
 * @returns Czy wartość jest poprawną walutą.
 * @remarks Czysta funkcja; type guard.
 */
export const isCurrency = (value: string): value is Currency =>
    CURRENCIES.includes(value as Currency);

/**
 * @param input Surowe dane formularza jako klucz-wartość.
 * @returns Result z parsowanym draftem lub błędem.
 * @remarks Czysta funkcja; niemutowalne transformacje; discriminated unions.
 */
export const parseExpenseForm = (
    input: Record<string, string>
): Result<ExpenseDraft> => {
    const amountRaw = (input["amount"] ??  "").trim();
    const amount = Number. parseFloat(amountRaw);
    if (! amountRaw || Number.isNaN(amount) || amount <= 0) {
        return { ok: false, error: "Kwota musi być liczbą dodatnią" };
    }
    const currencyRaw = (input["currency"] ?? "PLN").trim();
    if (!isCurrency(currencyRaw)) {
        return { ok: false, error: "Nieprawidłowa waluta" };
    }
    const currency = currencyRaw;
    const category = (input["category"] ?? "").trim();
    if (!category) {
        return { ok: false, error: "Kategoria jest wymagana" };
    }
    const dateISO = (input["date"] ?? "").trim();
    if (!dateISO) {
        return { ok: false, error: "Data jest wymagana" };
    }
    const note = (input["note"] ?? "").trim();
    return { ok: true, value: { amount, currency, category, dateISO, note } };
};

/**
 * @param draft Draft wydatku do walidacji.
 * @returns Lista problemów walidacyjnych; pusta jeśli poprawny.
 * @remarks Czysta funkcja; niemutowalne transformacje; kompozycja.
 */
export const validateExpense = (draft: ExpenseDraft): ReadonlyArray<Issue> => {
    const issues: Issue[] = [];
    if (draft.amount <= 0) {
        issues.push({ field: "amount", message: "Kwota musi być większa od 0" });
    }
    if (! isCurrency(draft.currency)) {
        issues.push({ field: "currency", message: "Nieprawidłowa waluta" });
    }
    if (! draft.category. trim()) {
        issues.push({ field: "category", message:  "Kategoria jest wymagana" });
    }
    if (!draft.dateISO || Number.isNaN(Date.parse(draft.dateISO))) {
        issues.push({ field: "date", message: "Wymagana poprawna data" });
    }
    return issues;
};

/**
 * @param filters Aktualne filtry.
 * @param patch Zmiany do zastosowania.
 * @returns Zwalidowane filtry z poprawionymi datami.
 * @remarks Czysta funkcja; niemutowalne transformacje; walidacja zakresu dat.
 */
export const validateFilters = (
    filters:  Filters,
    patch: Partial<Filters>
): Filters => {
    const next = { ...filters, ...patch };

    if (next.dateFrom && next.dateTo) {
        const fromTime = Date.parse(next.dateFrom);
        const toTime = Date. parse(next.dateTo);

        if (fromTime > toTime) {
            if ("dateFrom" in patch) {
                return { ...next, dateTo: next.dateFrom };
            }
            if ("dateTo" in patch) {
                return { ...next, dateFrom: next.dateTo };
            }
        }
    }

    return next;
};

/**
 * @param state Aktualny stan aplikacji.
 * @param action Akcja do zastosowania.
 * @returns Nowy stan po zastosowaniu akcji.
 * @remarks Czysta funkcja; niemutowalne transformacje; discriminated unions; data-first design.
 */
export const reduce = (state: State, action: Action): State => {
    switch (action.kind) {
        case "add": {
            const cats = state.categories.includes(action.expense.category)
                ? state.categories
                :  [...state.categories, action.expense.category];
            return {
                ...state,
                categories: cats,
                expenses: [action.expense, ...state.expenses]
            };
        }
        case "edit":
            return {
                ...state,
                expenses: state.expenses.map((e) =>
                    e.id === action. id ? { ...e, ...action.patch } : e
                )
            };
        case "delete":
            return {
                ...state,
                expenses: state.expenses.filter((e) => e.id !== action.id)
            };
        case "setFilters":  {
            const validatedFilters = validateFilters(state.filters, action.filters);
            return { ...state, filters: validatedFilters };
        }
        case "setSort":
            return { ...state, sort: action.sort };
        case "addCategory":
            if (
                ! action.category.trim() ||
                state.categories.includes(action. category)
            ) {
                return state;
            }
            return { ...state, categories: [...state. categories, action.category] };
        case "setCurrency":
            return { ...state, currency: action.currency };
        case "replaceState":
            return { ... action.state };
        case "mergeState":  {
            const merged = Array.from(
                new Set([...state.categories, ...action.state.categories])
            );
            const existingIds = new Set(state.expenses. map((e) => e.id));
            const newExpenses = action.state.expenses. filter(
                (e) => !existingIds.has(e. id)
            );
            return {
                ...state,
                categories: merged,
                expenses: [... state.expenses, ...newExpenses]
            };
        }
        default:
            return state;
    }
};

/**
 * @param state Aktualny stan.
 * @param filters Filtry do zastosowania.
 * @returns Przefiltrowane i posortowane wydatki.
 * @remarks Czysta funkcja; niemutowalne transformacje; kompozycja; funkcje wyższego rzędu.
 */
export const selectVisibleExpenses = (
    state: State,
    filters:  Filters
): ReadonlyArray<Expense> => {
    const matchDate = (e: Expense): boolean => {
        const t = Date.parse(e.dateISO);
        if (filters.dateFrom && t < Date.parse(filters.dateFrom)) return false;
        if (filters.dateTo && t > Date.parse(filters.dateTo)) return false;
        return true;
    };
    const matchCategory = (e: Expense): boolean =>
        ! filters.category || e.category === filters.category;
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

/**
 * @param expenses Lista wydatków do podsumowania.
 * @returns Podsumowanie z sumami.
 * @remarks Czysta funkcja; niemutowalne transformacje; kompozycja; data-first design.
 */
export const computeSummary = (expenses: ReadonlyArray<Expense>): Summary => {
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);

    const catMap = expenses.reduce<Record<string, number>>((acc, e) => {
        acc[e.category] = (acc[e.category] ??  0) + e.amount;
        return acc;
    }, {});
    const byCategory = Object.entries(catMap)
        .map(([category, t]) => ({ category, total: t }))
        .sort((a, b) => b.total - a.total);

    const monthMap = expenses.reduce<Record<string, number>>((acc, e) => {
        const month = e.dateISO.slice(0, 7);
        acc[month] = (acc[month] ?? 0) + e.amount;
        return acc;
    }, {});
    const monthly = Object.entries(monthMap)
        .map(([month, t]) => ({ month, total:  t }))
        .sort((a, b) => (b.month > a.month ? 1 :  -1));

    return { total, byCategory, monthly };
};

/**
 * @param state Stan do serializacji.
 * @returns Reprezentacja JSON jako string.
 * @remarks Czysta funkcja; niemutowalne transformacje.
 */
export const serialize = (state: State): string => JSON.stringify(state);

/**
 * @param text Tekst JSON do sparsowania.
 * @returns Result ze stanem lub błędem.
 * @remarks Czysta funkcja; discriminated unions; defensywne parsowanie.
 */
export const deserialize = (text: string): Result<State> => {
    try {
        const obj = JSON.parse(text);
        if (! obj || typeof obj !== "object") {
            return { ok: false, error: "Nieprawidłowa struktura JSON" };
        }
        if (! Array.isArray(obj.expenses) || ! Array.isArray(obj.categories)) {
            return { ok: false, error: "Brak tablicy wydatków lub kategorii" };
        }
        const expenses: Expense[] = obj. expenses
            .map((e: unknown) => {
                if (!e || typeof e !== "object") return null;
                const rec = e as Record<string, unknown>;
                const currencyRaw = String(rec["currency"] ?? "PLN");
                return {
                    id: String(rec["id"] ?? ""),
                    amount: Number(rec["amount"] ?? 0),
                    currency: isCurrency(currencyRaw) ? currencyRaw : "PLN",
                    category: String(rec["category"] ?? ""),
                    dateISO: String(rec["dateISO"] ?? ""),
                    note: String(rec["note"] ?? "")
                };
            })
            .filter(
                (e:  Expense | null): e is Expense =>
                    e !== null && e. id !== "" && e.category !== "" && e.dateISO !== "" && e.amount > 0
            );
        const currencyRaw = String(obj. currency ??  "PLN");
        const state:  State = {
            expenses,
            categories: obj.categories.map((c: unknown) => String(c)).filter(Boolean),
            currency: isCurrency(currencyRaw) ? currencyRaw : "PLN",
            filters: {
                dateFrom: obj.filters?.dateFrom ?? null,
                dateTo: obj.filters?.dateTo ?? null,
                category:  obj.filters?.category ?? null,
                text: obj.filters?. text ?? ""
            },
            sort: obj.sort === "amount" ? "amount" : "date"
        };
        return { ok: true, value: state };
    } catch {
        return { ok: false, error: "Nie udało się sparsować pliku JSON" };
    }
};