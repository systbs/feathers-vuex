import { Id, Params } from '@feathersjs/feathers';
import { omit } from 'lodash';
import { Store } from 'vuex';
import { StateInterface } from './types';

const whiteList = [
	'namespace',
	'store',
	'idField',
	'serverAlias',
	'servicePath',
	'modelName',
	'models'
];

export class Model {
	[key: string]: any;
	public static servicePath: string;
	public static namespace: string;

	public static store: Store<StateInterface>;
	public static readonly models: Record<any, any>;

	public static serverAlias: string;
	public static idField: string;

	public static modelName = 'Model';

	servicePath: string;
	namespace: string;
	serverAlias: string;
	idField: string;

	constructor(data: Record<any, any>, options?: any) {
		this.servicePath = '';
		this.namespace = '';
		this.serverAlias = '';
		this.idField = '';
		for (const key in data) {
			this[key] = Reflect.get(data, key);
		}
	}

	public static find(params?: Params) {
		const { namespace, store } = this;
		return store.dispatch(`${namespace}/find`, params)
	}

	public static get(id: Id, params?: Params) {
		console.log('static', { data: this });
		const { namespace, store } = this;
		return store.dispatch(`${namespace}/get`, { id, params })
	}

	public static count(params?: Params) {
		const { namespace, store } = this;
		return store.dispatch(`${namespace}/count`, params)
	}

	commit() {
		const { namespace, store, idField } = this;
		store.commit(`${namespace}/update`, this);
		return store.getters(`${namespace}/get`, this[idField]);
	}

	create(params?: Params) {
		const { namespace, store } = this;
		const data = Object.assign({}, this);
		return store.dispatch(`${namespace}/create`, { data, params });
	}

	remove(params?: Params) {
		const { namespace, store, idField } = this;
		const id = this[idField];
		if (id !== null) {
			return store.dispatch(`${namespace}/remove`, { id, params });
		}
		store.commit(`${namespace}/remove`, { id, params });
		return Promise.resolve(this);
	}

	patch(params?: Params) {
		const { namespace, store, idField } = this;
		const id = this[idField];
		if (id !== 0 && !id) {
			const error = new Error(
				`Missing ${idField} property. You must create the data before you can update with this data`
			)
			return Promise.reject(error)
		}
		const data = omit(this, whiteList);
		return store.dispatch(`${namespace}/patch`, { id, data, params });
	}

	update(params?: Params) {
		const { namespace, store, idField } = this;
		const id = this[idField];
		if (id !== 0 && !id) {
			const error = new Error(
				`Missing ${idField} property. You must create the data before you can update with this data`
			)
			return Promise.reject(error)
		}
		const data = omit(this, whiteList);
		return store.dispatch(`${namespace}/update`, { id, data, params });
	}
}
