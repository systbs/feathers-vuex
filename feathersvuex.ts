import { ActionTree, GetterTree, Module, MutationTree, Store } from 'vuex';
import { filterQuery, sorter, select } from '@feathersjs/adapter-commons';
import { unref } from 'vue';
import { omit, get, pick, merge, cloneDeep, set } from 'lodash';
import { Service, Application } from '@feathersjs/feathers';
import sift from 'sift';
import { StateInterface } from './types';
import { Model } from './model';
import { getServicePath, ns, assignIfNotPresent } from './utils';

const FILTERS = ['$sort', '$limit', '$skip', '$select']
const additionalOperators = ['$elemMatch']

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

	constructor(app: Application<any>, config: FeathersVuexOptions) {
		this.options = Object.assign(this.#defaults, config);
		this.models = {};
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
					const record = keyedById[id] && select(params, idField)(keyedById[id]);
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
			update: (state, payload) => {
				const { keyedById, idField } = state;
				const items = Array.isArray(payload) ? payload : [payload];
				for (let item of items) {
					const id = item[idField];
					if (id !== null && id !== undefined) {
						if (id in keyedById) {
							for (const key in item) {
								if (item[key] !== keyedById[id][key]) {
									keyedById[id][key] = Reflect.get(item, key);
								}
							}
						} else {
							const { serverAlias, modelName } = state
							const model = get(this.models, [serverAlias, modelName]);

							item = merge({}, item, model);

							if (Model && !(item instanceof Model)) {
								keyedById[id] = new Model(item);
							} else {
								keyedById[id] = item;
							}
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
			},
			patch(state, payload) {
				const { keyedById, idField } = state;
				const items = Array.isArray(payload) ? payload : [payload];
				for (const item of items) {
					const id = item[idField];
					if (id !== null && id !== undefined) {
						if (id in keyedById) {
							for (const key in item) {
								if (item[key] !== keyedById[id][key]) {
									keyedById[id][key] = Reflect.get(item, key);
								}
							}
						} else {
							let reflected: Record<string, any> = {};
							for (const key in item) {
								reflected[key] = Reflect.get(item, key);
							}
							if (Model && !(reflected instanceof Model)) {
								reflected = new Model(reflected)
							}
							keyedById[id] = reflected;
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
				return getters.get(payload);
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

		const fromOptions = pick(options, [
			'state',
			'getters',
			'mutations',
			'actions',
			'namespace',
			'modelName',
			'idField',
			'servicePath',
			'serverAlias'
		]);

		const state: any = merge({
			keyedById: {},
			namespace: '',
			pagination: {
				defaultLimit: 0,
				defaultSkip: 0,
			},
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
		}
	}

}
