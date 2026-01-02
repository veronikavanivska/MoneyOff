import { createInitialState, deserialize, serialize, State } from "../core";

export type StoragePort = Pick<Storage, "getItem" | "setItem">;

/**
 * @param storage Port do storage (np. localStorage).
 * @param key Klucz storage.
 * @param fallback Funkcja zwracająca stan domyślny.
 * @returns Stan z storage lub wartość domyślna.
 * @remarks Granica IO; izoluje efekty uboczne od domeny; fallback przy błędach parsowania.
 */
export const getState = (
    storage: StoragePort,
    key: string,
    fallback: () => State = createInitialState
): State => {
    const raw = storage.getItem(key);
    if (!raw) return fallback();

    const parsed = deserialize(raw);
    return parsed.ok ? parsed.value : fallback();
};

/**
 * @param storage Port do storage (np. localStorage).
 * @param key Klucz storage.
 * @param state Stan do zapisania.
 * @remarks Granica IO; zapis do storage; serializacja delegowana do jądra.
 */
export const persistState = (storage: StoragePort, key: string, state: State): void => {
    storage.setItem(key, serialize(state));
};
