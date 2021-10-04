import { Params } from '@feathersjs/feathers';
import { merge, omit } from 'lodash';
import { Ref, isRef, computed, ref, watch } from 'vue';
import { Model } from './model';

interface QueryOptions {
	model: typeof Model;
	method?: 'find' | 'get';
	params?: Params | Ref<Params>,
	hooks?: any;
}

interface QueryResult<T = any> {
	items?: Ref<T[]> | Ref<T>;
	paginationData?: Ref<Record<any, any>>;
	servicePath?: string;
	[key: string]: any;
}

function isPaginated(item: any) {
	return item && ('total' in item) && ('limit' in item) &&
		('skip' in item) && ('data' in item);
}

const unwrap = <T>(params: T | Ref<T>): T =>
	isRef(params) ? params.value : params;

export async function useQuery<M extends Model>(options: QueryOptions) {
	const { model, method, params, hooks } = merge({
		method: 'find',
		params: {},
		hooks: (record: any, context: any) => record
	}, options);

	if (!model) {
		throw new Error('No model provided for useQuery()');
	}

	function useHook(item: any, context: any) {
		if (hooks) {
			if (typeof hooks === 'function') {
				hooks(item, context);
			}
			if (Array.isArray(hooks)) {
				for (const hook of hooks) {
					if (typeof hook === 'function') {
						hook(item, context);
					}
				}
			}
		}
	}

	const response = ref<QueryResult<M>>({});

	const computes = {
		items: computed(() => {
			if (Array.isArray(response.value)) {
				for (const item of response.value) {
					useHook(item, { model, method, params });
				}
				return response.value;
			}
			else if (isPaginated(response.value)) {
				for (const item of response.value.data) {
					useHook(item, { model, method, params });
				}
				return response.value.data;
			}
			else {
				useHook(response.value, { model, method, params });
				return response.value ? [response.value] : [];
			}
		}),
		paginationData: computed(() => {
			if ('data' in response.value) {
				return omit(response.value, 'data');
			}
			return { total: 0, skip: 0, limit: 0 };
		}),
		servicePath: computed<string>(() => model.servicePath)
	}

	async function fetch(getterParams: any) {
		if (method && method.toLowerCase() === 'get') {
			const { id, params: paramsGet } = getterParams;
			response.value = await model.get(id, paramsGet);
		} else {
			response.value = await model.find(getterParams);
		}
	}

	watch(() => unwrap(params), async (value) => {
		if (value !== undefined) {
			await fetch(unwrap(params));
		}
	});

	await fetch(unwrap(params))

	return computes;
}

export default useQuery;
