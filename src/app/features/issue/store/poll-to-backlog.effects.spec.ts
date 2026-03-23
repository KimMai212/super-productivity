import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { Observable, of, Subject } from 'rxjs';
import { PollToBacklogEffects } from './poll-to-backlog.effects';
import { IssueService } from '../issue.service';
import { WorkContextService } from '../../work-context/work-context.service';
import { WorkContextType } from '../../work-context/work-context.model';
import { setActiveWorkContext } from '../../work-context/store/work-context.actions';
import { selectEnabledIssueProviders } from './issue-provider.selectors';
import { SyncTriggerService } from '../../../imex/sync/sync-trigger.service';
import { SnackService } from '../../../core/snack/snack.service';
import { JIRA_TYPE } from '../issue.const';
import { IssueProvider } from '../issue.model';

describe('PollToBacklogEffects', () => {
  let effects: PollToBacklogEffects;
  let actions$: Observable<any>;
  let store: MockStore;
  let issueServiceSpy: jasmine.SpyObj<IssueService>;
  let workContextServiceSpy: jasmine.SpyObj<WorkContextService>;

  const createMockIssueProvider = (
    overrides: Partial<IssueProvider> = {},
  ): IssueProvider =>
    ({
      id: 'provider-1',
      issueProviderKey: JIRA_TYPE,
      isEnabled: true,
      isAutoPoll: true,
      isAutoAddToBacklog: true,
      isIntegratedAddTaskBar: false,
      defaultProjectId: 'project-1',
      pinnedSearch: null,
      ...overrides,
    }) as IssueProvider;

  beforeEach(() => {
    issueServiceSpy = jasmine.createSpyObj('IssueService', [
      'getPollInterval',
      'checkAndImportNewIssuesToBacklogForProject',
    ]);

    issueServiceSpy.getPollInterval.and.returnValue(300000); // 5 minutes
    issueServiceSpy.checkAndImportNewIssuesToBacklogForProject.and.returnValue(
      Promise.resolve(),
    );

    workContextServiceSpy = jasmine.createSpyObj('WorkContextService', [], {
      isActiveWorkContextProject$: of(true),
      activeWorkContextId$: of('project-1'),
    });

    TestBed.configureTestingModule({
      providers: [
        PollToBacklogEffects,
        provideMockActions(() => actions$),
        provideMockStore({
          selectors: [{ selector: selectEnabledIssueProviders, value: [] }],
        }),
        { provide: IssueService, useValue: issueServiceSpy },
        { provide: WorkContextService, useValue: workContextServiceSpy },
        {
          provide: SyncTriggerService,
          useValue: { afterInitialSyncDoneAndDataLoadedInitially$: of(true) },
        },
        {
          provide: SnackService,
          useValue: jasmine.createSpyObj('SnackService', ['open']),
        },
      ],
    });

    effects = TestBed.inject(PollToBacklogEffects);
    store = TestBed.inject(MockStore);
  });

  afterEach(() => {
    store.resetSelectors();
  });

  describe('pollNewIssuesToBacklog$', () => {
    it('should poll when active project matches provider defaultProjectId', fakeAsync(() => {
      const provider = createMockIssueProvider({
        id: 'jira-1',
        defaultProjectId: 'project-1',
        isAutoAddToBacklog: true,
      });

      store.overrideSelector(selectEnabledIssueProviders, [provider]);
      store.refreshState();

      const actionsSubject = new Subject<any>();
      actions$ = actionsSubject.asObservable();

      effects.pollNewIssuesToBacklog$.subscribe();

      actionsSubject.next(
        setActiveWorkContext({
          activeType: WorkContextType.PROJECT,
          activeId: 'project-1',
        }),
      );

      tick(10001);

      expect(
        issueServiceSpy.checkAndImportNewIssuesToBacklogForProject,
      ).toHaveBeenCalledWith(JIRA_TYPE, 'jira-1');
    }));

    it('should NOT poll providers with pollingMode always (handled by separate effect)', fakeAsync(() => {
      const provider = createMockIssueProvider({
        id: 'jira-1',
        defaultProjectId: 'project-1',
        isAutoAddToBacklog: true,
        pollingMode: 'always',
      });

      store.overrideSelector(selectEnabledIssueProviders, [provider]);
      store.refreshState();

      const actionsSubject = new Subject<any>();
      actions$ = actionsSubject.asObservable();

      effects.pollNewIssuesToBacklog$.subscribe();

      actionsSubject.next(
        setActiveWorkContext({
          activeType: WorkContextType.PROJECT,
          activeId: 'project-1',
        }),
      );

      tick(10001);

      expect(
        issueServiceSpy.checkAndImportNewIssuesToBacklogForProject,
      ).not.toHaveBeenCalled();
    }));

    it('should NOT poll when active project does not match provider', fakeAsync(() => {
      const provider = createMockIssueProvider({
        id: 'jira-1',
        defaultProjectId: 'project-2', // Different from active project
        isAutoAddToBacklog: true,
      });

      store.overrideSelector(selectEnabledIssueProviders, [provider]);
      store.refreshState();

      const actionsSubject = new Subject<any>();
      actions$ = actionsSubject.asObservable();

      effects.pollNewIssuesToBacklog$.subscribe();

      actionsSubject.next(
        setActiveWorkContext({
          activeType: WorkContextType.PROJECT,
          activeId: 'project-1',
        }),
      );

      tick(10001);

      expect(
        issueServiceSpy.checkAndImportNewIssuesToBacklogForProject,
      ).not.toHaveBeenCalled();
    }));
  });

  describe('pollNewIssuesToBacklogAlways$', () => {
    it('should poll providers with pollingMode always regardless of active project', fakeAsync(() => {
      const provider = createMockIssueProvider({
        id: 'jira-1',
        defaultProjectId: 'project-2', // NOT the active project
        isAutoAddToBacklog: true,
        pollingMode: 'always',
      });

      store.overrideSelector(selectEnabledIssueProviders, [provider]);
      store.refreshState();

      const actionsSubject = new Subject<any>();
      actions$ = actionsSubject.asObservable();

      effects.pollNewIssuesToBacklogAlways$.subscribe();

      actionsSubject.next(
        setActiveWorkContext({
          activeType: WorkContextType.PROJECT,
          activeId: 'project-1',
        }),
      );

      tick(10001);

      expect(
        issueServiceSpy.checkAndImportNewIssuesToBacklogForProject,
      ).toHaveBeenCalledWith(JIRA_TYPE, 'jira-1');
    }));

    it('should NOT poll always-mode providers without isAutoAddToBacklog', fakeAsync(() => {
      const provider = createMockIssueProvider({
        id: 'jira-1',
        defaultProjectId: 'project-2',
        isAutoAddToBacklog: false,
        pollingMode: 'always',
      });

      store.overrideSelector(selectEnabledIssueProviders, [provider]);
      store.refreshState();

      const actionsSubject = new Subject<any>();
      actions$ = actionsSubject.asObservable();

      effects.pollNewIssuesToBacklogAlways$.subscribe();

      actionsSubject.next(
        setActiveWorkContext({
          activeType: WorkContextType.PROJECT,
          activeId: 'project-1',
        }),
      );

      tick(10001);

      expect(
        issueServiceSpy.checkAndImportNewIssuesToBacklogForProject,
      ).not.toHaveBeenCalled();
    }));

    it('should NOT poll always-mode providers without defaultProjectId', fakeAsync(() => {
      const provider = createMockIssueProvider({
        id: 'jira-1',
        defaultProjectId: null,
        isAutoAddToBacklog: true,
        pollingMode: 'always',
      });

      store.overrideSelector(selectEnabledIssueProviders, [provider]);
      store.refreshState();

      const actionsSubject = new Subject<any>();
      actions$ = actionsSubject.asObservable();

      effects.pollNewIssuesToBacklogAlways$.subscribe();

      actionsSubject.next(
        setActiveWorkContext({
          activeType: WorkContextType.PROJECT,
          activeId: 'project-1',
        }),
      );

      tick(10001);

      expect(
        issueServiceSpy.checkAndImportNewIssuesToBacklogForProject,
      ).not.toHaveBeenCalled();
    }));

    it('should NOT poll non-always providers in the always effect', fakeAsync(() => {
      const provider = createMockIssueProvider({
        id: 'jira-1',
        defaultProjectId: 'project-2',
        isAutoAddToBacklog: true,
        pollingMode: 'whenProjectOpen',
      });

      store.overrideSelector(selectEnabledIssueProviders, [provider]);
      store.refreshState();

      const actionsSubject = new Subject<any>();
      actions$ = actionsSubject.asObservable();

      effects.pollNewIssuesToBacklogAlways$.subscribe();

      actionsSubject.next(
        setActiveWorkContext({
          activeType: WorkContextType.PROJECT,
          activeId: 'project-1',
        }),
      );

      tick(10001);

      expect(
        issueServiceSpy.checkAndImportNewIssuesToBacklogForProject,
      ).not.toHaveBeenCalled();
    }));

    it('should also poll when context is a tag (not a project)', fakeAsync(() => {
      const provider = createMockIssueProvider({
        id: 'jira-1',
        defaultProjectId: 'project-2',
        isAutoAddToBacklog: true,
        pollingMode: 'always',
      });

      store.overrideSelector(selectEnabledIssueProviders, [provider]);
      store.refreshState();

      // Active context is a tag, not a project
      Object.defineProperty(workContextServiceSpy, 'isActiveWorkContextProject$', {
        get: () => of(false),
      });

      const actionsSubject = new Subject<any>();
      actions$ = actionsSubject.asObservable();

      effects.pollNewIssuesToBacklogAlways$.subscribe();

      actionsSubject.next(
        setActiveWorkContext({
          activeType: WorkContextType.TAG,
          activeId: 'tag-1',
        }),
      );

      tick(10001);

      expect(
        issueServiceSpy.checkAndImportNewIssuesToBacklogForProject,
      ).toHaveBeenCalledWith(JIRA_TYPE, 'jira-1');
    }));
  });
});
