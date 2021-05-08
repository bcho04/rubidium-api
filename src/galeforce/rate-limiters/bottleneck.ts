import { Region } from "../../riot-api";
import { ConfigInterface } from "../interfaces/config";
import RateLimiter from "./rate-limiter";
import Bottleneck from "bottleneck";
import _ from "lodash";
import debug from 'debug';
import chalk from 'chalk';

const ratelimitDebug = debug('galeforce:rate-limit');

export default class BottleneckRateLimiter extends RateLimiter {
    protected group: Bottleneck.Group;

    constructor(config: ConfigInterface['rate-limit']) {
        super(config);

        ratelimitDebug(`${chalk.bold.blueBright('create')} \u00AB ${chalk.bold.red('bottleneck')}`);

        if (config.cache.type === 'redis' && typeof config.cache.uri !== 'undefined') {
            this.group = new Bottleneck.Group({
                /* Limiter options */
                maxConcurrent: config.options['max-concurrent'],
                minTime: config.options['min-time'],

                /* Clustering options */
                id: config.cache["key-id"],
                datastore: 'redis',
                clientOptions: {
                    url: config.cache.uri,
                },
                timeout: (_.max(Object.keys(config.options.intervals).map(time => parseInt(time, 10))) || 300) * 1000, // default 5 minutes
            });
        } else if (config.cache.type === 'internal') {
            this.group = new Bottleneck.Group({
                /* Limiter options */
                maxConcurrent: config.options['max-concurrent'],
                minTime: config.options['min-time'],
                
                /* Clustering options */
                timeout: (_.max(Object.keys(config.options.intervals).map(time => parseInt(time, 10))) || 300) * 1000, // default 5 minutes
            });
        } else {
            throw new Error('[galeforce]: Invalid rate limit cache type provided in config.')
        }

        this.group.on('created', (limiter: Bottleneck, key: string) => {
            ratelimitDebug(`${chalk.bold.red(key)} | ${chalk.bold.blueBright('create')} \u00AB ${chalk.bold.red('limiter')}`);
            Object.entries(config.options.intervals).forEach(([interval, limit]) => {
                limiter.chain(new Bottleneck({
                    reservoir: limit,
                    reservoirRefreshInterval: parseInt(interval, 10) * 1000,
                    reservoirRefreshAmount: limit,
                }));
            });
        })
    }

    public schedule<T>(request: () => Promise<T>, region?: Region): Promise<T> {
        if (region) {
            ratelimitDebug(`${chalk.bold.red(region)} | ${chalk.bold.yellow('schedule')}`);
            return this.group.key(region).schedule(request);
        } else {
            return request();
        }
    }
}