export type Todo = {
	id: string;
	title: string;
	done: boolean;
	createdAt: number;
};

export function createTodo(title: string): Todo {
	return {
		id: crypto.randomUUID(),
		title: title.trim(),
		done: false,
		createdAt: Date.now()
	};
}

export const STORAGE_KEY = 'tidy-v2-todos';
