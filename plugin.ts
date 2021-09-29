import { ActionTree, GetterTree, Module, MutationTree, Store } from 'vuex';
import { filterQuery, sorter, select } from '@feathersjs/adapter-commons';
import { unref, reactive } from 'vue';
import { omit, trim, get, pick, merge } from 'lodash';
import { Service, Application, Params, Id } from '@feathersjs/feathers';
import sift from 'sift';
import CancelablePromise from 'cancelable-promise';

const FILTERS = ['$sort', '$limit', '$skip', '$select']
const additionalOperators = ['$elemMatch']

export function getServicePath(service: Service<any>, model: any) {
	if (!service.name && !service.path && !model.servicePath) {
		throw new Error(
			`Service for model named ${String(model.name)} is missing a path or name property.`
		);
	}
	return service.path || service.name || model.servicePath;
}

export function stripSlashes(location: string) {
	return trim(location, '/')
}

export function getShortName(service: any) {
	let namespace = stripSlashes(service)
	if (Array.isArray(namespace)) {
		namespace = namespace.slice(-1)
	} else if (namespace.includes('/')) {
		namespace = namespace.slice(namespace.lastIndexOf('/') + 1)
	}
	return namespace
}

export function getNameFromPath(service: any) {
	return stripSlashes(service)
}

export function createNamespace(namespace: any, servicePath: any, namestyle: string) {
	const nameStyles = {
		short: getShortName,
		path: getNameFromPath
	}
	if (namespace) {
		return namespace;
	}
	else if (namestyle === 'short') {
		return nameStyles[namestyle](servicePath);
	}
	return nameStyles['path'](servicePath);
}

export function assignIfNotPresent(model: any, props: any): void {
	for (const key in props) {
		if (!(key in model)) {
			model[key] = props[key]
		}
	}
}

export interface StateInterface {
	[key: string]: any;
}

export interface ModelSetupContext {
	store: StateInterface;
	models: Record<any, Model>;
}

export abstract class Model {
	[key: string]: any;
	// Think of these as abstract static properties
	public static servicePath: string;
	public static namespace: string;

	public static store: Store<StateInterface>;
	public static readonly models: Record<any, any>;

	public static serverAlias: string;
	public static idField: string;

	public static modelName = 'BaseModel';

	constructor(data: Record<any, any>, options: any) {
		for (const key in data) {
			this[key] = data[key];
		}
	}

	public static find(params?: Params) {
		const { namespace, store } = this;
		return store.dispatch(`${namespace}/find`, params)
	}

	public static get(id: Id, params?: Params) {
		const { namespace, store } = this;
		return store.dispatch(`${namespace}/get`, { id, params })
	}

	public static count(params?: Params) {
		const { namespace, store } = this;
		return store.dispatch(`${namespace}/count`, params)
	}

	commit() {
		const { namespace, store, idField } = this.constructor as typeof Model;
		store.commit(`${namespace}/update`, this);
		return store.getters(`${namespace}/get`, this[idField]);
	}

	create(params?: Params) {
		const { namespace, store } = this.constructor as typeof Model;
		const data = Object.assign({}, this);
		return store.dispatch(`${namespace}/create`, { data, params });
	}

	remove(params?: Params) {
		const { namespace, store, idField } = this.constructor as typeof Model;
		const id = this[idField];
		if (id !== null) {
			return store.dispatch(`${namespace}/remove`, { id, params });
		}
		store.commit(`${namespace}/remove`, { id, params });
		return CancelablePromise.resolve(this);
	}

	patch(params?: Params) {
		const { namespace, store, idField } = this.constructor as typeof Model;
		const id = this[idField];
		const data = Object.assign({}, this);
		if (id !== 0 && !id) {
			const error = new Error(
				`Missing ${idField} property. You must create the data before you can update with this data`
			)
			return Promise.reject(error)
		}
		return store.dispatch(`${namespace}/patch`, { id, data, params });
	}

	update(params?: Params) {
		const { namespace, store, idField } = this.constructor as typeof Model;
		const id = this[idField];
		const data = Object.assign({}, this);
		if (id !== 0 && !id) {
			const error = new Error(
				`Missing ${idField} property. You must create the data before you can update with this data`
			)
			return Promise.reject(error)
		}
		return store.dispatch(`${namespace}/update`, { id, data, params });
	}
}


export interface FeathersVuexOptions {
	serverAlias: string;
	idField?: string;
	namestyle?: string;
	paramsForServer?: string[];
	whitelist?: string[];
	debug?: boolean;
}

export interface ServicePluginExtendOptions {
	store: Store<any>
	module: any
}

export interface ServicePluginOptions {
	model: any;
	service: Service<any>;

	idField?: string;
	namestyle?: string;

	servicePath?: string;
	namespace?: string;

	whitelist?: string[];
	paramsForServer?: string[];

	extend?: (
		options: ServicePluginExtendOptions
	) => {
		state: any;
		getters: any;
		mutations: any;
		actions: any;
	}

	state?: any;
	getters?: any;
	mutations?: any;
	actions?: any;

	instanceDefaults?: () => any;
	setupInstance?: (instance: any) => any;
	debounceEventsMaxWait?: number;
}

export interface ServiceOptionsDefaults {
	servicePath: string;
	namespace: string;
	extend: (options: ServicePluginExtendOptions) => {
		state: any;
		getters: any;
		mutations: any;
		actions: any;
	};
	state: any;
	getters: any;
	mutations: any;
	actions: any;
	instanceDefaults: () => any;
	setupInstance: (instance: any) => any;
	debounceEventsMaxWait: number;
}

export interface PaginationState {
	ids: any;
	limit: number;
	skip: number;
	ip: number;
	total: number;
	mostRecent: any;
};

export interface ServiceStateExclusive extends Record<any, any> {
	ids: Record<any, any>;
	keyedById: Record<any, any>;
	namespace?: string;
	pagination?: {
		defaultLimit: number;
		defaultSkip: number;
		default?: PaginationState;
	}
	whitelist: string[];
	paramsForServer: string[];
	modelName: string;
	idField: string;
}

export default class FeathersVuex {
	models: { [k: string]: any };
	options: FeathersVuexOptions;
	#defaults: ServiceOptionsDefaults = {
		namespace: '',
		servicePath: '',
		extend: ({ module }) => module,
		state: {},
		getters: {},
		mutations: {},
		actions: {},
		instanceDefaults: () => ({}),
		setupInstance: instance => instance,
		debounceEventsMaxWait: 1000
	}
	#app: Application<any>;

	constructor(app: Application<any>, config: FeathersVuexOptions) {
		this.options = Object.assign({
			serverAlias: '',
			idField: 'id',
			namestyle: '',
			paramsForServer: [],
			whitelist: [],
			debug: false,
		}, config);
		this.models = {};
		this.#app = app;
	}

	addModel(model: any) {
		this.models[this.options.serverAlias] = this.models[this.options.serverAlias] || {
			byServicePath: {}
		}
		const name = String(model.modelName || model.name);
		if (this.models[this.options.serverAlias][name] && this.options.debug) {
			console.error(`Overwriting model: models[${this.options.serverAlias}][${name}].`);
		}
		this.models[this.options.serverAlias][name] = model;
		this.models[this.options.serverAlias].byServicePath[model.servicePath] = model;
	}

	clearModels() {
		Object.keys(this.models).forEach(key => {
			const serverAliasObj = this.models[key];
			Object.keys(serverAliasObj).forEach(key => {
				delete this.models[key];
			})
			delete this.models[key];
		})
	}

	createServiceModule<S extends ServiceStateExclusive, R = any>(
		service: Service<any>, options: ServicePluginOptions, store: Store<any>
	) {
		const getters: GetterTree<S, R> = {
			find(state) {
				const {
					paramsForServer,
					whitelist,
					keyedById,
				} = state

				return (payload: any) => {
					const params = unref(payload) || {};
					const q = omit(params.query || {}, paramsForServer);

					const { query, filters } = filterQuery(q, {
						operators: additionalOperators.concat(whitelist)
					});

					let values = Object.values<any>(keyedById);


					values = values.filter(sift(query))

					const total = values.length;

					if (filters.$sort !== undefined) {
						values.sort(sorter(filters.$sort));
					}

					if (filters.$skip !== undefined && filters.$limit !== undefined) {
						values = values.slice(filters.$skip, Number(filters.$limit) + Number(filters.$skip))
					} else if (filters.$skip !== undefined || filters.$limit !== undefined) {
						values = values.slice(filters.$skip, filters.$limit)
					}

					if (filters.$select) {
						values = select(params)(values)
					}

					return {
						total,
						limit: filters.$limit || 0,
						skip: filters.$skip || 0,
						data: values
					}
				}
			},
			get(state) {
				const { keyedById, idField } = state;
				return (payload: any) => {
					const { id, params } = payload;
					const record = keyedById[id] && select(params, idField)(keyedById[id])
					if (record) {
						return record
					}
					return null;
				}
			},
			count(state, getters) {
				return (payload: any) => {
					const params = unref(payload) || {};

					const cleanQuery = omit(params.query, FILTERS)
					params.query = cleanQuery

					return getters.find(params).total;
				}
			},
		}

		const mutations: MutationTree<S> = {
			update(state, payload) {
				const { keyedById, idField } = state;
				const items = Array.isArray(payload) ? payload : [payload];
				for (const item of items) {
					const id = item[idField];
					if (id !== null && id !== undefined) {
						if (id in keyedById) {
							item[id] = payload;
						} else {
							item[id] = reactive(payload);
						}
					}
				}
			},
			remove(state, payload) {
				const { keyedById, idField } = state;
				const items = Array.isArray(payload) ? payload : [payload];
				for (const item of items) {
					const id = item[idField];
					if (id !== null && id !== undefined) {
						if (id in keyedById) {
							unref(item[id]);
							delete item[id];
						}
					}
				}
			}
		};

		const actions: ActionTree<S, R> = {
			async create({ commit }, payload) {
				const { data, params } = payload;
				const response = await service.create(data, params);
				commit('update', response);
				return response;
			},

			async update({ commit }, payload) {
				const { id, data, params } = payload;
				const response = await service.update(id, data, params);
				commit('update', response);
				return response;
			},

			async find({ commit }, payload) {
				const response = await service.find(payload);
				if (Array.isArray(response)) {
					for (const favorite of response) {
						commit('update', favorite);
					}
				} else {
					for (const favorite of response.data) {
						commit('update', favorite);
					}
				}
				return response;
			},

			async get({ commit, getters }, payload) {
				const record = getters.get(payload);
				if (record !== undefined && record !== null) {
					return record;
				}
				const { id, params } = payload;
				const response = await service.get(id, params);
				if (response) {
					commit('update', response);
				}
				return response;
			},

			async remove({ commit }, payload) {
				const { id, params } = payload;
				const response = await service.remove(id, params);
				if (response) {
					commit('remove', response);
				}
				return response;
			},

			async patch({ commit }, payload) {
				const { id, data, params } = payload;
				const response = await service.patch(id, data, params);
				commit('update', response);
				return response;
			},
		}

		const state = function () {
			return Object.assign<any, any>({}, {
				ids: {},
				serviceName: '',
				keyedById: {},
				namespace: '',
				pagination: {
					defaultLimit: 0,
					defaultSkip: 0,
				},
				whitelist: [],
				paramsForServer: [],
				modelName: '',
				idField: 'id'
			});
		};

		const defaults: Module<S, R> = {
			namespaced: true,
			actions,
			getters,
			mutations,
			state
		};

		const fromOptions = pick(options, [
			'state',
			'getters',
			'mutations',
			'actions'
		]);

		const merged = merge({}, defaults, fromOptions)
		const extended = options.extend ? options.extend({ store, module: merged }) : { store, module: merged };
		const finalModule = merge({}, merged, extended)

		return finalModule;
	}

	createServicePlugin(config: ServicePluginOptions) {
		const options = Object.assign({}, this.#defaults, this.options, config);
		const { model, service, namespace, namestyle, instanceDefaults, setupInstance } = options;
		let { servicePath } = options;
		if (!servicePath) {
			servicePath = getServicePath(service, model);
		}
		options.servicePath = servicePath;

		return (store: Store<any>) => {
			options.namespace = createNamespace(namespace, servicePath, namestyle as string);
			const module = this.createServiceModule(service, options, store);
			store.registerModule(options.namespace, module, { preserveState: false });
			const BaseModel = get(this.models, [this.options.serverAlias, 'BaseModel']);
			if (BaseModel && !BaseModel.store) {
				Object.assign(BaseModel, { store });
			}

			assignIfNotPresent(model, {
				namespace: options.namespace,
				servicePath,
				instanceDefaults,
				setupInstance
			});

			Object.assign(model, { store });
			if (!model.modelName || model.modelName === 'BaseModel') {
				throw new Error('The modelName property is required for Models');
			}
			this.addModel(model);
		}
	}

}
