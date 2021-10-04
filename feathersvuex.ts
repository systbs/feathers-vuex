import { ActionTree, GetterTree, Module, MutationTree, Store } from 'vuex';
import { filterQuery, sorter, select } from '@feathersjs/adapter-commons';
import { unref, reactive } from 'vue';
import { omit, get, pick, merge } from 'lodash';
import { Service, Application } from '@feathersjs/feathers';
import sift from 'sift';
import { StateInterface } from './types';
import { getServicePath, ns, assignIfNotPresent } from './utils';

const FILTERS = ['$sort', '$limit', '$skip', '$select', '$regex', '$options']
const additionalOperators = ['$elemMatch']
const blacklist = [
	'options',
];

export interface ServicePluginOptions {
	model: any;
	service: Service<any>;

	idField?: string;
	modelName?: string;

	servicePath?: string;
	namespace?: string;

	whitelist?: string[];
	paramsForServer?: string[];

	state?: any;
	getters?: any;
	mutations?: any;
	actions?: any;

	debounceEventsMaxWait?: number;
	enableEvents?: boolean;
}

export interface FeathersVuexOptions {
	namespace?: string;
	serverAlias?: string;
	idField?: string;
	paramsForServer?: string[];
	whitelist?: string[];
	debug?: boolean;
	debounceEventsMaxWait?: number;
}

export interface FeathersVuexOptionsInstance extends FeathersVuexOptions {
	namespace: string;
	serverAlias: string;
	idField: string;
	paramsForServer: string[];
	whitelist: string[];
	debug: boolean;
	debounceEventsMaxWait: number;
}

export default class FeathersVuex {
	[key: string]: any;

	models: {
		[k: string]: any;
	};

	options: FeathersVuexOptionsInstance;

	#defaults: FeathersVuexOptionsInstance = {
		namespace: '',
		serverAlias: '',
		idField: '_id',
		paramsForServer: [],
		whitelist: [],
		debug: false,
		debounceEventsMaxWait: 1000
	};

	app: Application;

	constructor(app: Application<any>, config: FeathersVuexOptions) {
		this.options = Object.assign(this.#defaults, config);
		this.models = {};
		this.app = app;
	}

	private insert(model: any) {
		const { serverAlias, debug } = this.options;

		this.models[serverAlias] = this.models[serverAlias] || {
			byServicePath: {}
		}

		const name = String(model.modelName || model.name);

		if (this.models[serverAlias][name] && debug) {
			console.error(`Overwriting model: models[${serverAlias}][${name}].`);
		}

		this.models[serverAlias][name] = model;
		this.models[serverAlias].byServicePath[model.servicePath] = model;
	}

	private clear() {
		Object.keys(this.models).forEach(key => {
			const serverAliasObj = this.models[key];
			Object.keys(serverAliasObj).forEach(key => {
				delete this.models[key];
			});
			delete this.models[key];
		})
	}

	private remove(name: string) {
		const { serverAlias, debug } = this.options;
		if (!this.models[serverAlias][name] && debug) {
			console.error(`Overwriting model: models[${serverAlias}][${name}].`);
		}
		delete this.models[serverAlias][name];
	}

	createModule<S extends StateInterface = any, R = any>(
		service: Service<any>, options: ServicePluginOptions, store: Store<any>
	) {
		const getters: GetterTree<S, R> = {
			find(state) {
				const {
					paramsForServer,
					whitelist,
					ids,
				} = state

				return (payload: any) => {
					const params = unref(payload) || {};
					const q = omit(params.query || {}, paramsForServer);

					const { query, filters } = filterQuery(q, {
						operators: additionalOperators.concat(whitelist)
					});

					let values = Object.values<any>(ids);

					values = values.filter(sift(query))

					const total = values.length;

					if (filters.$sort !== undefined) {
						values.sort(sorter(filters.$sort));
					}

					const Qlimit = get(q, '$limit');
					if (Qlimit && Qlimit < 0) {
						if (filters.$select) {
							values = select(params)(values)
						}
						return values;
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
				const { ids, idField } = state;
				return (payload: any) => {
					const { id, params } = payload;
					return ids[id] && select(params, idField)(ids[id]);
				}
			},
			count(state, getters) {
				return (payload: any) => {
					const params = unref(payload) || {};

					const cleanQuery = omit(params.query, FILTERS)
					params.query = cleanQuery;

					return getters.find(params).total;
				}
			},
		}

		const mutations: MutationTree<S> = {
			update: (state, payload) => {
				const { ids, idField } = state;
				const items = Array.isArray(payload) ? payload : [payload];
				for (let item of items) {
					const id = item[idField];
					if (id !== null && id !== undefined) {
						if (id in ids) {
							for (const key in item) {
								if (item[key] !== ids[id][key]) {
									Reflect.set(ids[id], key, item[key]);
								}
							}
						} else {
							const { serverAlias, modelName } = state
							const model = get(this.models, [serverAlias, modelName]);

							item = reactive(merge({}, omit(item, blacklist)));

							ids[id] = new model(item);
						}
					}
				}
			},
			remove(state, payload) {
				const { ids, idField } = state;
				const items = Array.isArray(payload) ? payload : [payload];
				for (const item of items) {
					const id = item[idField];
					if (id !== null && id !== undefined) {
						if (id in ids) {
							unref(ids[id]);
							delete ids[id];
						}
					}
				}
			},
			upgrade: (state, payload) => {
				const { ids, idField } = state;
				const items = Array.isArray(payload) ? payload : [payload];
				for (let item of items) {
					const id = item[idField];
					if (id !== null && id !== undefined) {
						const { serverAlias, modelName } = state
						const model = get(this.models, [serverAlias, modelName]);

						item = reactive(merge({}, omit(item, blacklist)));

						ids[id] = new model(item);
					}
				}
			}
		};

		const actions: ActionTree<S, R> = {
			async create({ commit, getters, state }, payload) {
				const { data, params } = payload;
				const response = await service.create(data, params);
				commit('update', response);
				const { idField } = state;
				return getters.get({ id: response[idField] });
			},

			async update({ commit, getters }, payload) {
				const { id, data, params } = payload;
				const response = await service.update(id, data, params);
				commit('update', response);
				return getters.get(payload);
			},

			async find({ commit, getters }, payload) {
				const response = await service.find(payload);
				if (Array.isArray(response)) {
					for (const item of response) {
						commit('update', item);
					}
					return getters.find(payload);
				} else {
					const pagination = omit(response, 'data');
					for (const item of response.data) {
						commit('update', item);
					}
					return merge(getters.find(payload), pagination);
				}
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
				return getters.get(payload);
			},

			async remove({ commit, getters }, payload) {
				const { id, params } = payload;
				const response = await service.remove(id, params);
				if (response) {
					commit('remove', response);
				}
				return getters.get(response);
			},

			async patch({ commit, getters }, payload) {
				const { id, data, params } = payload;
				const response = await service.patch(id, data, params);
				commit('update', response);
				return getters.get(payload);
			},
		}

		const fromOptions = pick(options, [
			'state',
			'getters',
			'mutations',
			'actions',
			'namespace',
			'modelName',
			'idField',
			'servicePath',
			'serverAlias',
			'whitelist',
			'paramsForServer'
		]);

		const state: any = merge({
			ids: {},
			namespace: '',
			whitelist: [],
			paramsForServer: [],
			modelName: '',
			idField: '_id'
		}, fromOptions);

		const defaults: Module<S, R> = {
			namespaced: true,
			actions,
			getters,
			mutations,
			state
		};

		const merged = merge({}, defaults, fromOptions);

		return merge({}, merged, { store, module: merged });
	}

	enableServiceEvents(
		service: Service<any>,
		store: Store<any>,
		options: FeathersVuexOptionsInstance & ServicePluginOptions
	) {
		const { namespace } = options;
		service.on('created', (item: any) => {
			store.commit(`${namespace}/update`, item);
		})
		service.on('updated', item => {
			store.commit(`${namespace}/update`, item);
		})
		service.on('patched', item => {
			store.commit(`${namespace}/update`, item);
		})
		service.on('removed', item => {
			store.commit(`${namespace}/remove`, item);
		})
	}

	createServicePlugin(config: ServicePluginOptions) {
		const options = Object.assign({}, this.#defaults, this.options, config);
		const {
			model,
			service,
			namespace
		} = options;
		let { servicePath } = options;
		if (!servicePath) {
			servicePath = getServicePath(service, model);
		}

		options.servicePath = servicePath;
		options.modelName = model.modelName;

		return (store: Store<any>) => {
			options.namespace = ns(namespace, servicePath);

			const module = this.createModule(service, options, store);
			store.registerModule(options.namespace, module, { preserveState: false });

			const BaseModel = get(this.models, [this.options.serverAlias, 'Model']);
			if (BaseModel && !BaseModel.store) {
				Object.assign(BaseModel, { store });
			}

			assignIfNotPresent(model, {
				namespace: options.namespace,
				servicePath,
				idField: options.idField
			});

			Object.assign(model, { store });

			if (!model.modelName || model.modelName === 'Model') {
				throw new Error('The modelName property is required for Models');
			}

			this.insert(model);

			if (options.enableEvents) {
				this.enableServiceEvents(service, store, options);
			}
		}
	}

}
