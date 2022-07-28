import { Box, Button, Card, ColorInput, Group, MultiSelect, Space, Text, TextInput, PasswordInput, Title, Tooltip } from '@mantine/core';
import { randomId, useInterval } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useModals } from '@mantine/modals';
import { showNotification, updateNotification } from '@mantine/notifications';
import { CrossIcon, DeleteIcon } from 'components/icons';
import DownloadIcon from 'components/icons/DownloadIcon';
import Link from 'components/Link';
import { SmallTable } from 'components/SmallTable';
import useFetch from 'hooks/useFetch';
import { bytesToRead } from 'lib/clientUtils';
import { updateUser } from 'lib/redux/reducers/user';
import { useStoreDispatch, useStoreSelector } from 'lib/redux/store';
import { useEffect, useState } from 'react';
import MutedText from 'components/MutedText';

function ExportDataTooltip({ children }) {
  return <Tooltip position='top' color='' label='After clicking, if you have a lot of files the export can take a while to complete. A list of previous exports will be below to download.'>{children}</Tooltip>;
}

export default function Manage() {
  const user = useStoreSelector(state => state.user);
  const dispatch = useStoreDispatch();
  const modals = useModals();

  const [exports, setExports] = useState([]);
  const [domains, setDomains] = useState(user.domains ?? []);

  const genShareX = (withEmbed: boolean = false, withZws: boolean = false) => {
    const config = {
      Version: '13.2.1',
      Name: 'Zipline',
      DestinationType: 'ImageUploader, TextUploader',
      RequestMethod: 'POST',
      RequestURL: `${window.location.protocol + '//' + window.location.hostname + (window.location.port ? ':' + window.location.port : '')}/api/upload`,
      Headers: {
        Authorization: user?.token,
        ...(withEmbed && { Embed: 'true' }),
        ...(withZws && { ZWS: 'true' }),
      },
      URL: '$json:files[0]$',
      Body: 'MultipartFormData',
      FileFormName: 'file',
    };

    const pseudoElement = document.createElement('a');
    pseudoElement.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(config, null, '\t')));
    pseudoElement.setAttribute('download', `zipline${withEmbed ? '_embed' : ''}${withZws ? '_zws' : ''}.sxcu`);
    pseudoElement.style.display = 'none';
    document.body.appendChild(pseudoElement);
    pseudoElement.click();
    pseudoElement.parentNode.removeChild(pseudoElement);
  };

  const form = useForm({
    initialValues: {
      username: user.username,
      password: '',
      embedTitle: user.embedTitle ?? '',
      embedColor: user.embedColor,
      embedSiteName: user.embedSiteName ?? '',
      domains: user.domains ?? [],
    },
  });

  const onSubmit = async values => {
    const cleanUsername = values.username.trim();
    const cleanPassword = values.password.trim();
    const cleanEmbedTitle = values.embedTitle.trim();
    const cleanEmbedColor = values.embedColor.trim();
    const cleanEmbedSiteName = values.embedSiteName.trim();

    if (cleanUsername === '') return form.setFieldError('username', 'Username can\'t be nothing');

    showNotification({
      id: 'update-user',
      title: 'Updating user...',
      message: '',
      loading: true,
      autoClose: false,
    });

    const data = {
      username: cleanUsername,
      password: cleanPassword === '' ? null : cleanPassword,
      embedTitle: cleanEmbedTitle === '' ? null : cleanEmbedTitle,
      embedColor: cleanEmbedColor === '' ? null : cleanEmbedColor,
      embedSiteName: cleanEmbedSiteName === '' ? null : cleanEmbedSiteName,
      domains,
    };

    const newUser = await useFetch('/api/user', 'PATCH', data);

    if (newUser.error) {
      if (newUser.invalidDomains) {
        updateNotification({
          id: 'update-user',
          message: <>
            <Text mt='xs'>The following domains are invalid:</Text>
            {newUser.invalidDomains.map(err => (
              <>
                <Text color='gray' key={randomId()}>{err.domain}: {err.reason}</Text>
                <Space h='md' />
              </>
            ))}
          </>,
          color: 'red',
          icon: <CrossIcon />,
        });
      }
      updateNotification({
        id: 'update-user',
        title: 'Couldn\'t save user',
        message: newUser.error,
        color: 'red',
        icon: <CrossIcon />,
      });
    } else {
      dispatch(updateUser(newUser));
      updateNotification({
        id: 'update-user',
        title: 'Saved User',
        message: '',
      });
    }
  };

  const exportData = async () => {
    const res = await useFetch('/api/user/export', 'POST');
    if (res.url) {
      showNotification({
        title: 'Export started...',
        loading: true,
        message: 'If you have a lot of files, the export may take a while. The list of exports will be updated every 30s.',
      });
    }
  };

  const getExports = async () => {
    const res = await useFetch('/api/user/export');

    setExports(res.exports.map(s => ({
      date: new Date(Number(s.name.split('_')[3].slice(0, -4))),
      size: s.size,
      full: s.name,
    })).sort((a, b) => a.date.getTime() - b.date.getTime()));
  };

  const handleDelete = async () => {
    const res = await useFetch('/api/user/files', 'DELETE', {
      all: true,
    });

    if (!res.count) {
      showNotification({
        title: 'Couldn\'t delete files',
        message: res.error,
        color: 'red',
        icon: <CrossIcon />,
      });
    } else {
      showNotification({
        title: 'Deleted files',
        message: `${res.count} files deleted`,
        color: 'green',
        icon: <DeleteIcon />,
      });
    }
  };

  const openDeleteModal = () => modals.openConfirmModal({
    title: 'Are you sure you want to delete all of your images?',
    closeOnConfirm: false,
    labels: { confirm: 'Yes', cancel: 'No' },
    onConfirm: () => {
      modals.openConfirmModal({
        title: 'Are you really sure?',
        labels: { confirm: 'Yes', cancel: 'No' },
        onConfirm: () => {
          handleDelete();
          modals.closeAll();
        },
        onCancel: () => {
          modals.closeAll();
        },
      });
    },
  });

  const interval = useInterval(() => getExports(), 30000);
  useEffect(() => {
    getExports();
    interval.start();
  }, []);

  return (
    <>
      <Title>Manage User</Title>
      <MutedText size='md'>Want to use variables in embed text? Visit <Link href='https://zipline.diced.cf/docs/variables'>the docs</Link> for variables</MutedText>
      <form onSubmit={form.onSubmit((v) => onSubmit(v))}>
        <TextInput id='username' label='Username' {...form.getInputProps('username')} />
        <PasswordInput id='password' label='Password' description='Leave blank to keep your old password' {...form.getInputProps('password')} />
        <TextInput id='embedTitle' label='Embed Title' {...form.getInputProps('embedTitle')} />
        <ColorInput id='embedColor' label='Embed Color' {...form.getInputProps('embedColor')} />
        <TextInput id='embedSiteName' label='Embed Site Name' {...form.getInputProps('embedSiteName')} />
        <MultiSelect
          id='domains'
          label='Domains'
          data={domains}
          placeholder='Leave blank if you dont want random domain selection.'
          creatable
          searchable
          clearable
          getCreateLabel={query => `Add ${query}`}
          onCreate={query => setDomains((current) => [...current, query])}
          {...form.getInputProps('domains')}
        />

        <Group position='right' mt='md'>
          <Button
            type='submit'
          >Save User</Button>
        </Group>
      </form>

      <Box mb='md'>
        <Title>Manage Data</Title>
        <MutedText size='md'>Delete, or export your data into a zip file.</MutedText>
      </Box>

      <Group>
        <Button onClick={openDeleteModal} rightIcon={<DeleteIcon />}>Delete All Data</Button>
        <ExportDataTooltip><Button onClick={exportData} rightIcon={<DownloadIcon />}>Export Data</Button></ExportDataTooltip>
      </Group>
      <Card mt={22}>
        {exports && exports.length ? (
          <SmallTable
            columns={[
              { id: 'name', name: 'Name' },
              { id: 'date', name: 'Date' },
              { id: 'size', name: 'Size' },
            ]}
            rows={exports ? exports.map((x, i) => ({
              name: <Link href={'/api/user/export?name=' + x.full}>Export {i + 1}</Link>,
              date: x.date.toLocaleString(),
              size: bytesToRead(x.size),
            })) : []} />
        ) : (
          <Text>No exports yet</Text>
        )}
      </Card>

      <Title my='md'>ShareX Config</Title>
      <Group>
        <Button onClick={() => genShareX(false)} rightIcon={<DownloadIcon />}>ShareX Config</Button>
        <Button onClick={() => genShareX(true)} rightIcon={<DownloadIcon />}>ShareX Config with Embed</Button>
        <Button onClick={() => genShareX(false, true)} rightIcon={<DownloadIcon />}>ShareX Config with ZWS</Button>
      </Group>
    </>
  );
}