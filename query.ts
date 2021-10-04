import { Params } from '@feathersjs/feathers';
import { merge, omit } from 'lodash';
import { Ref, isRef, computed, reactive, watch } from 'vue';
import { Model } from './model';

interface QueryOptions {
	model: typeof Model;
	method?: 'find' | 'get';
	params?: Params | Ref<Params>,
	hooks?: any;
}

interface QueryResult<T = any> {
	items?: T[] | T;
	paginationData?: Record<any, any>;
	servicePath?: string;
	[key: string]: any;
}

const unwrap = <T>(params: T | Ref<T>): T =>
	isRef(params) ? params.value : params;

export async function useQuery<M extends Model>(options: QueryOptions) {
	const { model, method, params, hooks } = merge({
		method: 'find',
		params: {},
		hooks: (record: any, context?: any) => ({ record, context })
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

	const computes = reactive<QueryResult<M>>({
		servicePath: model.servicePath,
		model: model,
		class: typeof model
	});

	async function fetch(getterParams: any) {
		if (method && method.toLowerCase() === 'get') {
			const { id, params: paramsGet } = getterParams;
			const response = await model.get(id, paramsGet);
			useHook(response, { model, method, params });
			computes.items = response;
		} else {
			const response = await model.find(getterParams);
			if (Array.isArray(response)) {
				for (const item of response) {
					useHook(item, { model, method, params });
				}
				computes.items = response;
			} else {
				for (const item of response.data) {
					useHook(item, { model, method, params });
				}
				computes.items = response.data;
				computes.paginationData = omit(response, 'data');
			}
		}
		computes.servicePath = model.servicePath;
		computes.model = model;
		computes.class = typeof model;
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
